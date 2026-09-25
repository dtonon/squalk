import { SimplePool } from "@nostr/tools";
import type { AbstractRelay } from "@nostr/tools/abstract-relay";
import type { Event, EventTemplate } from "@nostr/tools/core";
import type { Filter } from "@nostr/tools/filter";
import { RELAY_URL } from "$lib/config";
import { auth } from "$lib/auth.svelte";

// Single long-lived pool for the forum relay. NIP-42 auth is wired here so a
// logged-in user's private and hidden rooms are served, and the connection
// persists so the handshake happens once rather than per request. Auth is
// scoped to the forum relay — external relays (profiles, search) are never
// authenticated against.
// Reconnection keeps the live subscriptions (chat, notifications) alive
// across a network drop: the library re-sends them with `since` moved past
// the last event seen, so what arrived meanwhile is replayed.
const pool = new SimplePool({ enableReconnect: true });

// The library retries after a 10s backoff and gives up after one failed
// attempt while still offline, so reconnect as soon as the network or the
// tab is back, and keep a shorter backoff for drops in between.
const FAST_BACKOFF = [1000, 2000, 5000, 10000];
async function forumRelay(): Promise<AbstractRelay> {
  const relay = await pool.ensureRelay(RELAY_URL);
  relay.resubscribeBackoff = FAST_BACKOFF;
  return relay;
}
function touchForumRelay() {
  forumRelay().catch(() => {});
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) touchForumRelay();
  });
  window.addEventListener("online", touchForumRelay);
}

// Scoped to the forum relay — external relays (profiles, search) are never
// authenticated against. Re-evaluated on every connection, so it picks up a
// login without a restart.
pool.automaticallyAuth = (url: string) => {
  if (url !== RELAY_URL) return null;
  const signer = auth.signer;
  if (!signer) return null;
  return (evt: EventTemplate) => signer.signEvent(evt);
};

export const forumPool = pool;

function authParam() {
  const signer = auth.signer;
  return signer
    ? { onauth: (evt: EventTemplate) => signer.signEvent(evt) }
    : {};
}

// Resolves once the forum connection is open and, when logged in, NIP-42
// authenticated. A broad metadata listing never triggers `auth-required`, so the
// handshake must finish *before* querying or hidden groups are silently filtered
// out of the response. `auth()` throws until the relay's on-connect challenge
// lands and resolves on its OK; it is idempotent, so this coexists with the
// pool's automatic auth. Bounded so a missing/declined signer can't block reads.
export async function ensureForumReady(): Promise<void> {
  const signer = auth.signer;
  if (!signer) return; // anonymous: only public groups are visible anyway
  let relay: AbstractRelay;
  try {
    relay = await forumRelay();
  } catch {
    return; // connection failed; the caller's own query surfaces the error
  }
  const sign = (evt: EventTemplate) => signer.signEvent(evt);
  const deadline = Date.now() + 3500;
  while (Date.now() < deadline) {
    try {
      await Promise.race([
        relay.auth(sign),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("auth-timeout")), 3000),
        ),
      ]);
      return; // authenticated
    } catch (e) {
      // The challenge may not have arrived yet — wait briefly and retry.
      if (e instanceof Error && e.message.includes("no challenge")) {
        await new Promise((r) => setTimeout(r, 25));
        continue;
      }
      return; // auth failed or timed out: fall back to public visibility
    }
  }
}

// Query the forum relay, authenticating first so private/hidden content is
// served to members; anonymous users transparently get the public subset.
export async function queryForum(
  filter: Filter,
  params?: { maxWait?: number; label?: string },
): Promise<Event[]> {
  await ensureForumReady();
  return pool.querySync([RELAY_URL], filter, params);
}

// Publish to the forum relay. `onauth` covers the reactive case where the relay
// rejects an unauthenticated write to a private/closed group.
export function publishForum(event: Event): Promise<string>[] {
  return pool.publish([RELAY_URL], event, authParam());
}

// Live subscription to the forum relay (e.g. chat). `onauth` lets the library
// authenticate and resubscribe if the relay rejects the subscription.
export function subscribeForum(
  filter: Filter,
  params: Parameters<SimplePool["subscribeMany"]>[2],
): { close(): void } {
  return pool.subscribeMany([RELAY_URL], filter, { ...authParam(), ...params });
}

// Shared connected (and, when logged in, authenticated) relay for code paths
// that drive their own subscriptions: paged thread loads, the overview, the
// membership probe. Never close it — the pool owns its lifecycle.
export async function ensureForumRelay(): Promise<AbstractRelay> {
  await ensureForumReady();
  return forumRelay();
}

// Drop the forum connection so the next use reconnects and re-runs the AUTH
// handshake with the current signer. Called on the logout transition.
export function resetForumConnection(): void {
  pool.close([RELAY_URL]);
}

// NIP-11 document of the forum relay, fetched once per session. Used for NIP-43
// discovery (clients must only send relay join requests to relays advertising
// it; `self` signs the membership events we read back) and for the access gate,
// which can show the relay's name before anything else is readable.
export type ForumRelayInfo = {
  self: string | null;
  nips: string[];
  name: string;
  description: string;
  icon: string;
  authRequired: boolean;
};
let relayInfo: Promise<ForumRelayInfo> | null = null;

export function forumRelayInfo(): Promise<ForumRelayInfo> {
  if (!relayInfo) {
    relayInfo = import("@nostr/tools/nip11")
      .then(({ fetchRelayInformation }) => fetchRelayInformation(RELAY_URL))
      .then((info) => {
        // `self` is a NIP-43 addition the library type doesn't know yet
        const self = (info as { self?: unknown }).self;
        return {
          self: typeof self === "string" ? self : null,
          // Relays mix numbers and strings in this list
          nips: (info.supported_nips ?? []).map(String),
          name: info.name ?? "",
          description: info.description ?? "",
          icon: info.icon ?? "",
          authRequired: info.limitation?.auth_required === true,
        };
      })
      .catch(() => ({
        self: null,
        nips: [],
        name: "",
        description: "",
        icon: "",
        authRequired: false,
      }));
  }
  return relayInfo;
}

// The relay pubkey when the forum relay supports NIP-43 relay membership,
// otherwise null (no relay-level join is needed or allowed).
export async function nip43Self(): Promise<string | null> {
  const info = await forumRelayInfo();
  return info.nips.includes("43") ? info.self : null;
}
