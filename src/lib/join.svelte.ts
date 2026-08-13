import type { AbstractRelay } from "@nostr/tools/abstract-relay";
import type { Event } from "@nostr/tools/core";
import { auth } from "$lib/auth.svelte";
import { GROUP_ID, MODE } from "$lib/config";
import { ensureForumRelay, publishForum, nip43Self } from "$lib/relay";
import { getGroupName } from "$lib/group.svelte";
import { showToast } from "$lib/toast.svelte";

type Membership = "member" | "guest";
// "none": the relay doesn't support NIP-43, so no relay-level join exists.
type RelayMembership = Membership | "none";

// Writing to a group can be gated at two levels: the relay itself (NIP-43) and
// the group (NIP-29). Neither gate is advertised up front, so membership is
// probed by reading the relay's membership events and, failing that, by trying
// to join and reacting to the rejection. Both caches are keyed by pubkey so a
// silent session restore (anon → pubkey) re-evaluates instead of reusing the
// "guest" cached before auth.user was populated.
let membership = $state<Record<string, Membership>>({});
let relayMembership = $state<Record<string, RelayMembership>>({});
const checking = new Map<string, Promise<void>>();

// The modal only appears when a relay refused a step and needs user input.
// - relay-code: the relay requires an invite code (NIP-43 claim)
// - group-code: the group refused the join; a code may be needed
// - pending: the group accepted the request but membership isn't granted yet
//   (admin approval); an invite code, if any, can still be tried
// - error: a terminal refusal (e.g. banned); nothing the user can enter helps
export type JoinStep = "relay-code" | "group-code" | "pending" | "error";

let modalOpen = $state(false);
let modalStep = $state<JoinStep>("group-code");
let modalGroup = $state<string | null>(null);
let modalError = $state<string | null>(null);
// A rejection message that mentions a code makes the code field the primary
// affordance rather than a discreet fallback.
let modalCodeHinted = $state(false);
let busy = $state(false);
// Continuation to run once access is granted (open the composer, focus the
// reply box, reload a now-visible feed, or retry the original post).
let onJoined: (() => void | Promise<void>) | null = null;

const memberKey = (groupId: string) =>
  `${auth.user?.pubkey ?? "anon"}:${groupId}`;

export const joinState = {
  get modalOpen() {
    return modalOpen;
  },
  get modalStep() {
    return modalStep;
  },
  get modalError() {
    return modalError;
  },
  get modalCodeHinted() {
    return modalCodeHinted;
  },
  get busy() {
    return busy;
  },
};

export function resetJoinState() {
  membership = {};
  relayMembership = {};
  modalOpen = false;
  modalGroup = null;
  modalError = null;
  modalCodeHinted = false;
  busy = false;
  onJoined = null;
}

export function membershipOf(groupId: string): Membership | "unknown" {
  return membership[memberKey(groupId)] ?? "unknown";
}

// Resolves membership for a group once and caches it. Logged-out users are
// always guests; the relay query only runs when signed in. Returns the shared
// in-flight promise when a check is already running, so an awaiting caller
// (e.g. clicking "New discussion") gets the real result rather than racing past
// an unresolved "unknown".
export function ensureMembershipChecked(groupId: string): Promise<void> {
  if (!groupId) return Promise.resolve();
  const pubkey = auth.user?.pubkey;
  const k = memberKey(groupId);
  if (membership[k]) return Promise.resolve();
  if (!pubkey) {
    membership[k] = "guest";
    return Promise.resolve();
  }
  const existing = checking.get(k);
  if (existing) return existing;
  const p = (async () => {
    try {
      const isMember = await checkMembership(pubkey, groupId);
      membership[k] = isMember ? "member" : "guest";
    } finally {
      checking.delete(k);
    }
  })();
  checking.set(k, p);
  return p;
}

type SubFilter = Parameters<AbstractRelay["subscribe"]>[0][number];

// Collects every event matching the filter until EOSE/close/timeout.
function queryEvents(
  relay: AbstractRelay,
  filter: SubFilter,
  timeoutMs = 3000,
): Promise<Event[]> {
  return new Promise((resolve) => {
    let settled = false;
    const events: Event[] = [];
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        sub.close();
      } catch {}
      resolve(events);
    };
    const sub = relay.subscribe([filter], {
      onevent(e) {
        events.push(e);
      },
      oneose: finish,
      onclose: finish,
    });
    setTimeout(finish, timeoutMs);
  });
}

// Existence check for a single matching event (resolves true on first event,
// false on EOSE/close/timeout).
function queryHasMatch(
  relay: AbstractRelay,
  filter: SubFilter,
  timeoutMs = 3000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val: boolean) => {
      if (settled) return;
      settled = true;
      try {
        sub.close();
      } catch {}
      resolve(val);
    };
    const sub = relay.subscribe([filter], {
      onevent() {
        finish(true);
      },
      oneose() {
        finish(false);
      },
      onclose() {
        finish(false);
      },
    });
    setTimeout(() => finish(false), timeoutMs);
  });
}

// Newest `created_at` among events matching the filter, or null if none. We
// don't trust the relay to honour limit ordering, so we keep the max across all
// returned events (the #p filter keeps the set tiny).
async function latestCreatedAt(
  relay: AbstractRelay,
  filter: SubFilter,
): Promise<number | null> {
  const events = await queryEvents(relay, filter);
  return events.reduce<number | null>(
    (max, e) => (max === null || e.created_at > max ? e.created_at : max),
    null,
  );
}

// Add/remove events are the freshest signal: the newest of the two decides
// (a later removal unjoins). When the relay keeps neither, the list decides.
function decideMembership(
  added: number | null,
  removed: number | null,
  listed: boolean,
): boolean {
  if (added !== null || removed !== null) {
    return added !== null && added >= (removed ?? -Infinity);
  }
  return listed;
}

// Group membership — i.e. "is this user allowed to write here". Admins
// (kind:39001) can post but need not appear in the members list, so they count
// as members. Otherwise NIP-29 records membership as kind:9000 (add) and
// kind:9001 (remove) moderation events, with the kind:39002 list as fallback.
async function checkMembership(
  pubkey: string,
  groupId: string,
): Promise<boolean> {
  let relay: AbstractRelay;
  try {
    relay = await ensureForumRelay();
  } catch {
    return false;
  }
  const [isAdmin, added, removed, listed] = await Promise.all([
    queryHasMatch(relay, {
      kinds: [39001],
      "#d": [groupId],
      "#p": [pubkey],
      limit: 1,
    }),
    latestCreatedAt(relay, { kinds: [9000], "#h": [groupId], "#p": [pubkey] }),
    latestCreatedAt(relay, { kinds: [9001], "#h": [groupId], "#p": [pubkey] }),
    queryHasMatch(relay, {
      kinds: [39002],
      "#d": [groupId],
      "#p": [pubkey],
      limit: 1,
    }),
  ]);
  if (isAdmin) return true;
  return decideMembership(added, removed, listed);
}

// Relay membership (NIP-43), mirroring the group check: kind:8000 (add) and
// kind:8001 (remove) signed by the relay, with the kind:13534 list as fallback.
// The `member` tag isn't filterable, so the list is fetched and scanned.
async function checkRelayMembership(
  pubkey: string,
  self: string,
): Promise<boolean> {
  let relay: AbstractRelay;
  try {
    relay = await ensureForumRelay();
  } catch {
    return false;
  }
  const [added, removed, lists] = await Promise.all([
    latestCreatedAt(relay, { kinds: [8000], authors: [self], "#p": [pubkey] }),
    latestCreatedAt(relay, { kinds: [8001], authors: [self], "#p": [pubkey] }),
    queryEvents(relay, { kinds: [13534], authors: [self], limit: 1 }),
  ]);
  const listed = lists.some((e) =>
    e.tags.some((t) => t[0] === "member" && t[1] === pubkey),
  );
  return decideMembership(added, removed, listed);
}

function ensureRelayMembershipChecked(pubkey: string): Promise<void> {
  if (relayMembership[pubkey]) return Promise.resolve();
  const k = `relay:${pubkey}`;
  const existing = checking.get(k);
  if (existing) return existing;
  const p = (async () => {
    try {
      const self = await nip43Self();
      if (!self) {
        relayMembership[pubkey] = "none";
        return;
      }
      const isMember = await checkRelayMembership(pubkey, self);
      relayMembership[pubkey] = isMember ? "member" : "guest";
    } finally {
      checking.delete(k);
    }
  })();
  checking.set(k, p);
  return p;
}

// Probes both membership levels at login so a returning member's first post
// needs no join at all. Full mode checks groups lazily per room instead.
export async function initJoinForUser(pubkey: string) {
  await Promise.all([
    ensureRelayMembershipChecked(pubkey),
    MODE === "simple" ? ensureMembershipChecked(GROUP_ID) : undefined,
  ]);
}

// Publishing rejections carry the relay's NIP-01 OK message; the prefix is the
// only cross-relay contract for what went wrong.
function reason(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
const prefixed = (msg: string, prefix: string) =>
  msg.toLowerCase().startsWith(prefix);
const stripPrefix = (msg: string) => msg.replace(/^[a-z-]+:\s*/i, "");
const mentionsCode = (msg: string) => /\b(code|invite|claim)\b/i.test(msg);

async function publishSigned(kind: number, tags: string[][]): Promise<void> {
  if (!auth.signer) throw new Error("Not logged in");
  const event = await auth.signer.signEvent({
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Relay did not respond in time")), 8000),
  );
  await Promise.race([Promise.all(publishForum(event)), timeout]);
}

type Codes = { relay?: string; group?: string };
type Refusal = { step: JoinStep; message: string | null; codeHinted: boolean };
type Outcome = { ok: true } | ({ ok: false } & Refusal);

const fail = (
  step: JoinStep,
  message: string | null,
  codeHinted = false,
): Outcome => ({ ok: false, step, message, codeHinted });

// Runs the two-level join: relay first (a group join needs relay membership),
// then group. Everything free happens silently; the first refusal is reported
// as the step needing user input.
async function ensureAccess(groupId: string, codes: Codes): Promise<Outcome> {
  const pubkey = auth.user?.pubkey;
  if (!pubkey) return fail("error", "Not logged in");

  await ensureRelayMembershipChecked(pubkey);
  // Set when the relay refused the join for an unclear reason: a group
  // refusal right after is then more likely the relay gate than the group's.
  let relayRefused = false;
  if (relayMembership[pubkey] === "guest") {
    const tags: string[][] = [["-"]];
    if (codes.relay) tags.push(["claim", codes.relay]);
    try {
      await publishSigned(28934, tags);
      relayMembership[pubkey] = "member";
    } catch (e) {
      const msg = reason(e);
      if (prefixed(msg, "duplicate:")) {
        relayMembership[pubkey] = "member";
      } else if (prefixed(msg, "restricted:")) {
        // A bare request refused is the expected probe, not a user error
        return fail("relay-code", codes.relay ? stripPrefix(msg) : null, true);
      } else if (prefixed(msg, "blocked:")) {
        return fail("error", stripPrefix(msg));
      } else {
        relayRefused = true;
      }
    }
  }

  await ensureMembershipChecked(groupId);
  const k = memberKey(groupId);
  if (membership[k] === "member") return { ok: true };
  const tags: string[][] = [["h", groupId]];
  if (codes.group) tags.push(["code", codes.group]);
  try {
    await publishSigned(9021, tags);
  } catch (e) {
    const msg = reason(e);
    if (!prefixed(msg, "duplicate:")) {
      if (prefixed(msg, "restricted:") && relayRefused) {
        return fail("relay-code", stripPrefix(msg), true);
      }
      if (prefixed(msg, "restricted:")) {
        const hinted = mentionsCode(msg);
        return fail(
          "group-code",
          codes.group || !hinted ? stripPrefix(msg) : null,
          hinted,
        );
      }
      return fail("error", stripPrefix(msg));
    }
  }
  // An accepted request doesn't imply membership: closed groups may hold it
  // for admin approval, so re-read the relay's records before trusting it.
  if (await checkMembership(pubkey, groupId)) {
    membership[k] = "member";
    showToast(`You joined ${getGroupName(groupId)}`);
    return { ok: true };
  }
  return fail("pending", codes.group ? "The code was not accepted" : null);
}

function openModal(
  groupId: string,
  refusal: Refusal,
  cb: (() => void | Promise<void>) | null,
) {
  modalGroup = groupId;
  onJoined = cb;
  modalStep = refusal.step;
  modalCodeHinted = refusal.codeHinted;
  modalError = refusal.message;
  modalOpen = true;
}

// Wraps an action that posts to `groupId`, joining relay and group first when
// needed. A write refused for membership reasons (e.g. a stale cache after the
// relay changed policy) invalidates both caches and retries once from the top.
// Returns false when the modal took over; the action then runs on its success.
export async function withJoin(
  groupId: string,
  action: () => void | Promise<void>,
): Promise<boolean> {
  if (busy) return false;
  busy = true;
  try {
    return await runWithAccess(groupId, action, {}, true);
  } finally {
    busy = false;
  }
}

async function runWithAccess(
  groupId: string,
  action: () => void | Promise<void>,
  codes: Codes,
  retry: boolean,
): Promise<boolean> {
  const outcome = await ensureAccess(groupId, codes);
  if (!outcome.ok) {
    openModal(groupId, outcome, action);
    return false;
  }
  try {
    await action();
    return true;
  } catch (e) {
    const pubkey = auth.user?.pubkey;
    if (retry && pubkey && prefixed(reason(e), "restricted:")) {
      delete membership[memberKey(groupId)];
      if (relayMembership[pubkey] === "member")
        relayMembership[pubkey] = "guest";
      return runWithAccess(groupId, action, codes, false);
    }
    throw e;
  }
}

export function closeJoinModal() {
  if (busy) return;
  modalOpen = false;
  modalGroup = null;
  modalError = null;
  onJoined = null;
}

// Re-runs the join with the code entered for the current step. Errors keep the
// modal open for a retry; a further gate switches the modal to that step.
export async function submitJoinCode(code?: string) {
  if (!modalGroup || busy) return;
  busy = true;
  modalError = null;
  const groupId = modalGroup;
  const cb = onJoined;
  const codes: Codes =
    modalStep === "relay-code" ? { relay: code } : { group: code };
  try {
    const outcome = await ensureAccess(groupId, codes);
    if (!outcome.ok) {
      openModal(groupId, outcome, cb);
      return;
    }
    modalOpen = false;
    modalGroup = null;
    onJoined = null;
    if (cb) await cb();
  } catch (e) {
    modalError = reason(e);
  } finally {
    busy = false;
  }
}
