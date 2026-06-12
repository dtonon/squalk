import type { AbstractRelay } from "@nostr/tools/abstract-relay";
import { auth } from "$lib/auth.svelte";
import { GROUP_ID, MODE, JOINCODE_REQUIRED } from "$lib/config";
import { ensureForumRelay, publishForum } from "$lib/relay";
import { getGroupFlags } from "$lib/group.svelte";

type Membership = "member" | "guest";

// Per-group membership, resolved lazily and cached reactively so compose
// actions can be gated before the user writes anything. Keyed by pubkey so a
// silent session restore (anon → pubkey) re-evaluates instead of reusing the
// "guest" cached before auth.user was populated; the read stays a pure getter
// (no state writes inside a derivation).
let membership = $state<Record<string, Membership>>({});
const checking = new Map<string, Promise<void>>();

let modalOpen = $state(false);
let modalGroup = $state<string | null>(null);
let modalError = $state<string | null>(null);
let busy = $state(false);
// Continuation to run once the join succeeds (open the composer, focus the
// reply box, reload a now-visible feed, or retry the original post).
let onJoined: (() => void | Promise<void>) | null = null;

const memberKey = (groupId: string) =>
  `${auth.user?.pubkey ?? "anon"}:${groupId}`;

export const joinState = {
  get modalOpen() {
    return modalOpen;
  },
  get modalError() {
    return modalError;
  },
  get busy() {
    return busy;
  },
  // Closed groups (and a globally configured invite gate) can't be self-joined,
  // so the modal collects an invite code; open groups just confirm.
  get needsCode() {
    if (JOINCODE_REQUIRED) return true;
    const f = modalGroup ? getGroupFlags(modalGroup) : null;
    return !!f?.isClosed;
  },
};

export function resetJoinState() {
  membership = {};
  modalOpen = false;
  modalGroup = null;
  modalError = null;
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

// Existence check for a single matching event (resolves true on first event,
// false on EOSE/close/timeout). Used for the kind:39002 members-list fallback.
function queryHasMatch(
  relay: AbstractRelay,
  filter: Parameters<AbstractRelay["subscribe"]>[0][number],
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
function latestCreatedAt(
  relay: AbstractRelay,
  filter: Parameters<AbstractRelay["subscribe"]>[0][number],
  timeoutMs = 3000,
): Promise<number | null> {
  return new Promise((resolve) => {
    let settled = false;
    let latest: number | null = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      try {
        sub.close();
      } catch {}
      resolve(latest);
    };
    const sub = relay.subscribe([filter], {
      onevent(e) {
        if (latest === null || e.created_at > latest) latest = e.created_at;
      },
      oneose: finish,
      onclose: finish,
    });
    setTimeout(finish, timeoutMs);
  });
}

// Membership signal for one group — i.e. "is this user allowed to write here".
// Admins (kind:39001) can post but need not appear in the members list, so they
// count as members. Otherwise NIP-29 records membership as moderation events:
// kind:9000 adds a user, kind:9001 removes one, so the newest of the two for
// this user decides current membership (a later 9001 unjoins them). When the
// relay keeps neither, fall back to the kind:39002 members list.
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
  const [isAdmin, added, removed] = await Promise.all([
    queryHasMatch(relay, {
      kinds: [39001],
      "#d": [groupId],
      "#p": [pubkey],
      limit: 1,
    }),
    latestCreatedAt(relay, { kinds: [9000], "#h": [groupId], "#p": [pubkey] }),
    latestCreatedAt(relay, { kinds: [9001], "#h": [groupId], "#p": [pubkey] }),
  ]);
  if (isAdmin) return true;
  if (added !== null || removed !== null) {
    return added !== null && added >= (removed ?? -Infinity);
  }
  return queryHasMatch(relay, {
    kinds: [39002],
    "#d": [groupId],
    "#p": [pubkey],
    limit: 1,
  });
}

// Simple mode pre-checks the single configured group at login so the first post
// skips the 9021. Full mode checks lazily per room when the user first acts.
export async function initJoinForUser(pubkey: string) {
  if (MODE !== "simple") return;
  if (await checkMembership(pubkey, GROUP_ID)) {
    membership[memberKey(GROUP_ID)] = "member";
  }
}

export function closeJoinModal() {
  if (busy) return;
  modalOpen = false;
  modalGroup = null;
  modalError = null;
  onJoined = null;
}

// Opens the join modal for a group, with an optional continuation to run after
// a successful join (open the composer, focus the reply box, reload the feed).
export function openJoinModal(
  groupId: string,
  cb?: () => void | Promise<void>,
) {
  modalGroup = groupId;
  onJoined = cb ?? null;
  modalError = null;
  modalOpen = true;
}

async function publishJoinRequest(groupId: string, code?: string) {
  if (!auth.signer) throw new Error("Not logged in");
  const tags: string[][] = [["h", groupId]];
  if (code) tags.push(["code", code]);
  const event = await auth.signer.signEvent({
    kind: 9021,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Relay did not respond in time")), 8000),
  );
  await Promise.race([Promise.all(publishForum(event)), timeout]);
}

// Sends the kind:9021 for the modal's target group, marks the user joined, and
// runs the pending continuation. Errors keep the modal open for a retry.
export async function submitJoin(code?: string) {
  if (!modalGroup || busy) return;
  busy = true;
  modalError = null;
  const groupId = modalGroup;
  const cb = onJoined;
  try {
    await publishJoinRequest(groupId, code);
    membership[memberKey(groupId)] = "member";
    modalOpen = false;
    modalGroup = null;
    onJoined = null;
    if (cb) await cb();
  } catch (e) {
    modalError = e instanceof Error ? e.message : "Could not join the group";
  } finally {
    busy = false;
  }
}

// Wraps an action that posts to `groupId`. The relay requires membership to
// write to any group, so a non-member is joined first. Compose entry points
// gate membership up front, making this mostly a safety net: it joins
// transparently if possible, else opens the modal to retry.
export async function withJoin(
  groupId: string,
  action: () => Promise<void>,
): Promise<boolean> {
  if (membership[memberKey(groupId)] === "member") {
    await action();
    return true;
  }
  busy = true;
  try {
    const pubkey = auth.user?.pubkey;
    if (pubkey && (await checkMembership(pubkey, groupId))) {
      membership[memberKey(groupId)] = "member";
      await action();
      return true;
    }
    await publishJoinRequest(groupId);
    await action();
    membership[memberKey(groupId)] = "member";
    return true;
  } catch (e) {
    modalGroup = groupId;
    onJoined = action;
    modalError = e instanceof Error ? e.message : "Could not join the group";
    modalOpen = true;
    return false;
  } finally {
    busy = false;
  }
}
