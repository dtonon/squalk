import { SimplePool, type Event } from "@nostr/tools";
import * as nip19 from "@nostr/tools/nip19";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import type { NostrUser } from "@nostr/gadgets/metadata";
import { RELAY_URL, GROUP_ID } from "$lib/config";

export type ProfileEntry = {
  pubkey: string;
  npub: string;
  name?: string;
  displayName?: string;
  nip05?: string;
  picture?: string;
  about?: string;
  fetchedAt: number;
};

const LAST_SYNC_KEY = "profiles_last_sync";
const SEARCH_RELAYS = [
  "wss://relay.noswhere.com",
  "wss://search.nos.today",
  "wss://relay.nostr.band",
];
// Indexer relays used for kind:0 / kind:3 lookups. The forum relay almost
// never has these — they live on each author's outbox relays — so we query
// a small set of well-known aggregators.
const PROFILE_RELAYS = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://relay.damus.io",
  "wss://nos.lol",
];
const FETCH_BATCH_SIZE = 500;

const profiles = new SvelteMap<string, ProfileEntry>();
const groupMembers = new SvelteSet<string>();
const userFollows = new SvelteSet<string>();

export const profileStore = {
  get profiles() {
    return profiles;
  },
  get groupMembers() {
    return groupMembers;
  },
  get userFollows() {
    return userFollows;
  },
};

function parseProfileEvent(evt: Event): ProfileEntry | null {
  if (evt.kind !== 0) return null;
  let md: {
    name?: string;
    display_name?: string;
    nip05?: string;
    picture?: string;
    about?: string;
  } = {};
  try {
    md = JSON.parse(evt.content);
  } catch {
    // Ignore malformed metadata
  }
  return {
    pubkey: evt.pubkey,
    npub: nip19.npubEncode(evt.pubkey),
    name: md.name,
    displayName: md.display_name,
    nip05: md.nip05,
    picture: md.picture,
    about: md.about,
    fetchedAt: evt.created_at,
  };
}

function upsertProfile(entry: ProfileEntry) {
  const existing = profiles.get(entry.pubkey);
  if (existing && existing.fetchedAt >= entry.fetchedAt) return;
  profiles.set(entry.pubkey, entry);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function rankFor(pubkey: string, contextPubkeys?: Set<string>): number {
  if (contextPubkeys?.has(pubkey)) return 100;
  if (groupMembers.has(pubkey)) return 50;
  if (userFollows.has(pubkey)) return 10;
  return 1;
}

function profileMatchesQuery(p: ProfileEntry, q: string): boolean {
  if (!q) return true;
  const ql = q.toLowerCase();
  if (p.name?.toLowerCase().includes(ql)) return true;
  if (p.displayName?.toLowerCase().includes(ql)) return true;
  if (p.nip05?.toLowerCase().includes(ql)) return true;
  return false;
}

export type SearchOptions = {
  contextPubkeys?: Set<string>;
  limit?: number;
};

export function searchLocalProfiles(
  query: string,
  opts?: SearchOptions,
): ProfileEntry[] {
  const limit = opts?.limit ?? 8;
  const q = query.trim();
  const matches: { entry: ProfileEntry; rank: number; prefix: number }[] = [];
  for (const p of profiles.values()) {
    if (!profileMatchesQuery(p, q)) continue;
    const ql = q.toLowerCase();
    const prefix =
      p.name?.toLowerCase().startsWith(ql) ||
      p.displayName?.toLowerCase().startsWith(ql) ||
      p.nip05?.toLowerCase().startsWith(ql)
        ? 1
        : 0;
    matches.push({ entry: p, rank: rankFor(p.pubkey, opts?.contextPubkeys), prefix });
  }
  matches.sort((a, b) => {
    if (a.prefix !== b.prefix) return b.prefix - a.prefix;
    if (a.rank !== b.rank) return b.rank - a.rank;
    const an = a.entry.name ?? a.entry.displayName ?? "";
    const bn = b.entry.name ?? b.entry.displayName ?? "";
    return an.localeCompare(bn);
  });
  return matches.slice(0, limit).map((m) => m.entry);
}

export async function searchRemoteProfiles(
  query: string,
  signal?: AbortSignal,
): Promise<ProfileEntry[]> {
  const q = query.trim();
  if (!q) return [];
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(
      SEARCH_RELAYS,
      { kinds: [0], search: q, limit: 20 },
      { maxWait: 4000 },
    );
    if (signal?.aborted) return [];
    const byPubkey = new Map<string, ProfileEntry>();
    for (const evt of events) {
      const entry = parseProfileEvent(evt);
      if (!entry) continue;
      const existing = byPubkey.get(entry.pubkey);
      if (!existing || existing.fetchedAt < entry.fetchedAt) {
        byPubkey.set(entry.pubkey, entry);
      }
      upsertProfile(entry);
    }
    return [...byPubkey.values()];
  } catch (e) {
    console.error("[profiles] remote search failed", e);
    return [];
  } finally {
    pool.close(SEARCH_RELAYS);
  }
}

let seedPromise: Promise<void> | null = null;

export function seedProfiles(userPubkey: string | null): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = doSeedProfiles(userPubkey).catch((e) => {
    console.error("[profiles] seed failed", e);
  });
  return seedPromise;
}

async function doSeedProfiles(userPubkey: string | null) {
  const pool = new SimplePool();
  try {
    // Group members live on the forum relay (NIP-29).
    const groupEvents = await pool.querySync([RELAY_URL], {
      kinds: [39002],
      "#d": [GROUP_ID],
      limit: 1,
    });
    for (const evt of groupEvents) {
      for (const t of evt.tags) {
        if (t[0] === "p" && t[1]) groupMembers.add(t[1]);
      }
    }

    // Follow lists live on each user's outbox relays — query indexers.
    if (userPubkey) {
      const followEvents = await pool.querySync(PROFILE_RELAYS, {
        kinds: [3],
        authors: [userPubkey],
        limit: 1,
      });
      let latest: Event | null = null;
      for (const evt of followEvents) {
        if (!latest || evt.created_at > latest.created_at) latest = evt;
      }
      if (latest) {
        for (const t of latest.tags) {
          if (t[0] === "p" && t[1]) userFollows.add(t[1]);
        }
      }
    }

    const seedSet = new Set<string>([...groupMembers, ...userFollows]);
    console.log(
      `[profiles] seed: ${groupMembers.size} group members, ${userFollows.size} follows`,
    );
    if (seedSet.size === 0) return;

    const known: string[] = [];
    const unknown: string[] = [];
    for (const pk of seedSet) {
      if (profiles.has(pk)) known.push(pk);
      else unknown.push(pk);
    }

    const lastSync = parseInt(
      localStorage.getItem(LAST_SYNC_KEY) ?? "0",
      10,
    );

    const fetches: Promise<Event[]>[] = [];
    for (const batch of chunk(known, FETCH_BATCH_SIZE)) {
      fetches.push(
        pool.querySync(PROFILE_RELAYS, {
          kinds: [0],
          authors: batch,
          since: lastSync,
        }),
      );
    }
    for (const batch of chunk(unknown, FETCH_BATCH_SIZE)) {
      fetches.push(
        pool.querySync(PROFILE_RELAYS, { kinds: [0], authors: batch }),
      );
    }

    const results = await Promise.all(fetches);
    let count = 0;
    for (const events of results) {
      for (const evt of events) {
        const entry = parseProfileEvent(evt);
        if (entry) {
          upsertProfile(entry);
          count++;
        }
      }
    }
    console.log(`[profiles] seeded ${count} kind:0 events into cache`);

    localStorage.setItem(
      LAST_SYNC_KEY,
      String(Math.floor(Date.now() / 1000)),
    );
  } finally {
    pool.close([RELAY_URL, ...PROFILE_RELAYS]);
  }
}

const pendingFetch = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function ensureProfile(pubkey: string) {
  if (profiles.has(pubkey)) return;
  pendingFetch.add(pubkey);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushPendingFetch, 50);
}

async function flushPendingFetch() {
  flushTimer = null;
  if (pendingFetch.size === 0) return;
  const batch = Array.from(pendingFetch);
  pendingFetch.clear();
  const pool = new SimplePool();
  try {
    const events = await pool.querySync(PROFILE_RELAYS, {
      kinds: [0],
      authors: batch,
    });
    for (const evt of events) {
      const entry = parseProfileEvent(evt);
      if (entry) upsertProfile(entry);
    }
  } catch (e) {
    console.error("[profiles] lazy fetch failed", e);
  } finally {
    pool.close(PROFILE_RELAYS);
  }
}

export function ingestProfileEvent(evt: Event) {
  const entry = parseProfileEvent(evt);
  if (entry) upsertProfile(entry);
}

export function ingestNostrUser(user: NostrUser) {
  if (!user.pubkey) return;
  const md = user.metadata ?? {};
  const entry: ProfileEntry = {
    pubkey: user.pubkey,
    npub: user.npub,
    name: md.name,
    displayName: md.display_name,
    nip05: md.nip05,
    picture: md.picture ?? user.image,
    about: md.about,
    fetchedAt: user.lastUpdated || 0,
  };
  upsertProfile(entry);
}
