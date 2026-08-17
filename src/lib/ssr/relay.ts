import { SimplePool } from "@nostr/tools";
import type { Event } from "@nostr/tools/core";
import type { Filter } from "@nostr/tools/filter";
import { RELAY_URL } from "$lib/config";
import { PROFILE_RELAYS } from "$lib/forum/profiles";
import type { Query } from "$lib/forum/query";

// Anonymous relay access for server rendering. The server has no signer, so
// it only ever sees what the relay serves the public; members get their
// private rooms once the client takes over. Every query is bounded so a slow
// relay degrades to an empty page, never a hung request, and results are
// cached briefly to absorb crawler bursts.
const QUERY_TIMEOUT = 2500;
const PROFILE_TIMEOUT = 1500;
const CACHE_TTL = 30_000;
const CACHE_MAX = 2000;

const pool = new SimplePool();
const cache = new Map<string, { at: number; result: Promise<Event[]> }>();

// Resolve at EOSE from every relay or at the deadline, whichever comes first,
// with whatever arrived: a stalled relay must not cost the events the others
// already delivered.
function boundedQuery(
  relays: string[],
  filter: Filter,
  maxWait: number,
): Promise<Event[]> {
  return new Promise((resolve) => {
    const events: Event[] = [];
    let done = false;
    let sub: { close(): void } | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sub?.close();
      resolve(events);
    };
    const timer = setTimeout(finish, maxWait);
    try {
      sub = pool.subscribeMany(relays, filter, {
        onevent: (e) => events.push(e),
        oneose: finish,
      });
      if (done) sub.close(); // EOSE fired synchronously
    } catch {
      finish();
    }
  });
}

function cachedQuery(
  relays: string[],
  filter: Filter,
  maxWait: number,
): Promise<Event[]> {
  const key = relays.join(",") + "|" + JSON.stringify(filter);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL) return hit.result;
  if (cache.size >= CACHE_MAX) cache.clear();
  const result = boundedQuery(relays, filter, maxWait);
  cache.set(key, { at: now, result });
  return result;
}

export const forumQuery: Query = (filter) =>
  cachedQuery([RELAY_URL], filter, QUERY_TIMEOUT);

// Profiles mostly live off the forum relay; ask it too for members who only
// published there.
export const profileQuery: Query = (filter) =>
  cachedQuery([RELAY_URL, ...PROFILE_RELAYS], filter, PROFILE_TIMEOUT);
