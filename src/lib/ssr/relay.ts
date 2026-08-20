import { SimplePool } from "@nostr/tools";
import type { Event } from "@nostr/tools/core";
import type { Filter } from "@nostr/tools/filter";
import { RELAY_URL } from "$lib/config";
import { PROFILE_RELAYS } from "$lib/forum/profiles";
import type { Query } from "$lib/forum/query";

// Anonymous relay access for server rendering. The server has no signer, so
// it only ever sees what the relay serves the public; members get their
// private rooms once the client takes over. Every query is bounded so a slow
// relay degrades to an empty page, never a hung request.
//
// Results are cached in memory. Freshness only matters to crawlers and cold
// refreshes — the browser always refetches live data after hydration — so
// forum data lives as long as the edge cache (CACHE_CONTROL's s-maxage) and
// profiles, which rarely change, for an hour.
const QUERY_TIMEOUT = 2500;
const PROFILE_TIMEOUT = 1500;
const CONNECT_TIMEOUT = 1500;
const FORUM_TTL = 5 * 60_000;
const PROFILE_TTL = 60 * 60_000;
const DEAD_RELAY_TTL = 5 * 60_000;
const CACHE_MAX = 2000;

const pool = new SimplePool();
const cache = new Map<string, { at: number; result: Promise<Event[]> }>();
// Relays that failed to connect are skipped for a while, so a dead profile
// relay doesn't add its connect timeout to every cold page.
const deadUntil = new Map<string, number>();

// Ask every reachable relay and resolve as soon as each has answered (EOSE or
// closed), or at the deadline, whichever comes first — always with whatever
// arrived, so one stalled relay never costs the events the others delivered.
function boundedQuery(
  relays: string[],
  filter: Filter,
  maxWait: number,
): Promise<Event[]> {
  return new Promise((resolve) => {
    const events: Event[] = [];
    const subs: { close(): void }[] = [];
    let done = false;
    let pending = 0;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const s of subs) {
        try {
          s.close();
        } catch {
          // Already closed
        }
      }
      resolve(events);
    };
    const timer = setTimeout(finish, maxWait);

    const now = Date.now();
    const live = relays.filter((url) => (deadUntil.get(url) ?? 0) <= now);
    pending = live.length;
    if (pending === 0) return finish();

    for (const url of live) {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        if (--pending <= 0) finish();
      };
      pool.ensureRelay(url, { connectionTimeout: CONNECT_TIMEOUT }).then(
        (relay) => {
          if (done) return settle();
          const sub = relay.subscribe([filter], {
            onevent: (e) => events.push(e),
            oneose: () => {
              sub.close();
              settle();
            },
            onclose: settle,
          });
          subs.push(sub);
        },
        () => {
          deadUntil.set(url, Date.now() + DEAD_RELAY_TTL);
          settle();
        },
      );
    }
  });
}

function cachedQuery(
  relays: string[],
  filter: Filter,
  maxWait: number,
  ttl: number,
): Promise<Event[]> {
  const key = relays.join(",") + "|" + JSON.stringify(filter);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < ttl) return hit.result;
  if (cache.size >= CACHE_MAX) cache.clear();
  const result = boundedQuery(relays, filter, maxWait);
  cache.set(key, { at: now, result });
  return result;
}

export const forumQuery: Query = (filter) =>
  cachedQuery([RELAY_URL], filter, QUERY_TIMEOUT, FORUM_TTL);

// Profiles mostly live off the forum relay; ask it too for members who only
// published there.
export const profileQuery: Query = (filter) =>
  cachedQuery(
    [RELAY_URL, ...PROFILE_RELAYS],
    filter,
    PROFILE_TIMEOUT,
    PROFILE_TTL,
  );
