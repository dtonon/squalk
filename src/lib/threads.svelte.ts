import { Relay } from "@nostr/tools";
import type { Event } from "@nostr/tools/core";
import type { Filter } from "@nostr/tools/filter";
import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";
import { RELAY_URL } from "$lib/config";
import { ingestNostrUser } from "$lib/profiles.svelte";

const PAGE_SIZE = 30;
const WALK_LIMIT = 150; // Events per walk query (~5x PAGE_SIZE)
const WALK_MAX_ITERS = 12;

export type ThreadData = {
  id: string;
  title: string;
  labels: string[];
  authorPubkey: string;
  createdAt: number;
  replyCount: number;
  latestAt: number;
  latestPubkey: string;
  replierPubkeys: string[]; // unique reply authors, excl. OP, max 4
};

let threads = $state<ThreadData[]>([]);
let profiles = $state<Record<string, NostrUser>>({});
let exhausted = $state(false);
let loading = $state(false);
let loadingMore = $state(false);

let cursor: number | null = null; // latestAt of the last loaded thread
let snapshotAt = 0; // upper time bound, frozen at initial load

export const threadStore = {
  get threads() {
    return threads;
  },
  get profiles() {
    return profiles;
  },
  get exhausted() {
    return exhausted;
  },
  get loading() {
    return loading;
  },
  get loadingMore() {
    return loadingMore;
  },
};

async function loadProfile(pubkey: string) {
  if (profiles[pubkey]) return;
  const user = await loadNostrUser(pubkey);
  profiles[pubkey] = user;
  ingestNostrUser(user);
}

function querySync(relay: Relay, filter: Filter): Promise<Event[]> {
  return new Promise((resolve) => {
    const events: Event[] = [];
    const sub = relay.subscribe([filter], {
      onevent(e) {
        events.push(e);
      },
      oneose() {
        sub.close();
        resolve(events);
      },
      onclose() {
        resolve(events);
      },
    });
  });
}

function threadIdOf(e: Event): string | undefined {
  return e.kind === 11 ? e.id : e.tags.find((t) => t[0] === "E")?.[1];
}

type SliceItem = {
  id: string;
  latestAt: number;
  latestPubkey: string;
  op?: Event;
};

// Walk the combined OP + reply stream newest-first, collecting up to `n` unique
// threads not already shown. The first event seen for a thread defines its
// activity timestamp. Returns the slice plus the cursor for the next call.
async function fetchActivitySlice(
  relay: Relay,
  groupId: string,
  until: number,
  exclude: Set<string>,
  n: number,
): Promise<{ items: SliceItem[]; nextCursor: number | null; done: boolean }> {
  const collected = new Map<string, SliceItem>();
  let cur = until;
  let done = false;

  for (let i = 0; i < WALK_MAX_ITERS && collected.size < n; i++) {
    const events = await querySync(relay, {
      kinds: [11, 1111],
      "#h": [groupId],
      until: cur,
      limit: WALK_LIMIT,
    });
    if (events.length === 0) {
      done = true;
      break;
    }

    events.sort((a, b) => b.created_at - a.created_at);
    let oldest = cur;
    for (const e of events) {
      oldest = Math.min(oldest, e.created_at);
      const id = threadIdOf(e);
      if (!id || exclude.has(id) || collected.has(id)) continue;
      collected.set(id, {
        id,
        latestAt: e.created_at,
        latestPubkey: e.pubkey,
        op: e.kind === 11 ? e : undefined,
      });
      if (collected.size >= n) break;
    }

    if (events.length < WALK_LIMIT) {
      done = true;
      break;
    }
    if (oldest >= cur) break; // No progress (single timestamp floods the window)
    cur = oldest; // Inclusive; thread-level dedupe absorbs re-reads
  }

  const items = [...collected.values()].sort((a, b) => b.latestAt - a.latestAt);
  const nextCursor = items.length > 0 ? items[items.length - 1].latestAt : null;
  return { items, nextCursor, done };
}

// Reply enrichment (exact counts + sampled repliers), bounded by the frozen
// snapshot. Isolated so the future creation-by-date view can skip it entirely.
async function enrichWithReplies(
  relay: Relay,
  groupId: string,
  items: SliceItem[],
): Promise<Map<string, { count: number; repliers: string[] }>> {
  const result = new Map<string, { count: number; repliers: string[] }>();
  if (items.length === 0) return result;

  const replies = await querySync(relay, {
    kinds: [1111],
    "#h": [groupId],
    "#E": items.map((it) => it.id),
    until: snapshotAt,
    limit: 5000,
  });

  const acc = new Map<string, { count: number; pubkeys: Set<string> }>();
  for (const r of replies) {
    const root = r.tags.find((t) => t[0] === "E")?.[1];
    if (!root) continue;
    let a = acc.get(root);
    if (!a) {
      a = { count: 0, pubkeys: new Set() };
      acc.set(root, a);
    }
    a.count++;
    a.pubkeys.add(r.pubkey);
  }

  for (const it of items) {
    const a = acc.get(it.id);
    const repliers = a
      ? [...a.pubkeys].filter((p) => p !== it.op?.pubkey).slice(0, 4)
      : [];
    result.set(it.id, { count: a?.count ?? 0, repliers });
  }
  return result;
}

async function buildThreads(
  relay: Relay,
  groupId: string,
  items: SliceItem[],
): Promise<ThreadData[]> {
  // Backfill OPs for threads first seen via a reply
  const missing = items.filter((it) => !it.op).map((it) => it.id);
  if (missing.length > 0) {
    const ops = await querySync(relay, {
      kinds: [11],
      "#h": [groupId],
      ids: missing,
    });
    const byId = new Map(ops.map((e) => [e.id, e]));
    for (const it of items) if (!it.op) it.op = byId.get(it.id);
  }

  const enriched = await enrichWithReplies(relay, groupId, items);

  const out: ThreadData[] = [];
  for (const it of items) {
    const op = it.op;
    if (!op) continue; // OP missing (deleted/unavailable) — drop the row
    const e = enriched.get(it.id);
    out.push({
      id: it.id,
      title: op.tags.find((t) => t[0] === "title")?.[1] ?? "(untitled)",
      labels: op.tags.filter((t) => t[0] === "t" && t[1]).map((t) => t[1]),
      authorPubkey: op.pubkey,
      createdAt: op.created_at,
      replyCount: e?.count ?? 0,
      latestAt: it.latestAt,
      latestPubkey: it.latestPubkey,
      replierPubkeys: e?.repliers ?? [],
    });
  }
  return out;
}

async function fetchInto(append: boolean, groupId: string) {
  const relay = await Relay.connect(RELAY_URL);
  try {
    const until = append ? (cursor ?? snapshotAt) : snapshotAt;
    const exclude = new Set(threads.map((t) => t.id));
    const { items, nextCursor, done } = await fetchActivitySlice(
      relay,
      groupId,
      until,
      exclude,
      PAGE_SIZE,
    );
    const built = await buildThreads(relay, groupId, items);

    threads = append ? [...threads, ...built] : built;
    cursor = nextCursor ?? cursor;
    exhausted = done || built.length === 0;

    for (const t of built) {
      loadProfile(t.authorPubkey);
      loadProfile(t.latestPubkey);
      for (const p of t.replierPubkeys) loadProfile(p);
    }
  } finally {
    relay.close();
  }
}

export async function loadThreads(groupId: string) {
  if (loading) return;
  loading = true;
  threads = [];
  cursor = null;
  exhausted = false;
  snapshotAt = Math.floor(Date.now() / 1000);
  try {
    await fetchInto(false, groupId);
  } finally {
    loading = false;
  }
}

export async function loadMore(groupId: string) {
  if (loading || loadingMore || exhausted) return;
  loadingMore = true;
  try {
    await fetchInto(true, groupId);
  } finally {
    loadingMore = false;
  }
}
