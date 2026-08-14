import type { Event } from "@nostr/tools/core";
import { tag, tags, type Query } from "./query";

export const PAGE_SIZE = 30;
const WALK_LIMIT = 150; // Events per walk query (~5x PAGE_SIZE)
const WALK_MAX_ITERS = 12;

export type SortMode = "active" | "new";

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

export type ThreadPage = {
  threads: ThreadData[];
  nextCursor: number | null; // sort-key value of the last thread
  done: boolean;
};

export type PageRequest = {
  sort: SortMode;
  until: number; // upper bound on the sort key (inclusive)
  snapshotAt: number; // upper time bound for reply counts, frozen per listing
  exclude?: Set<string>; // thread ids already shown
  n?: number;
};

type SliceItem = {
  id: string;
  latestAt: number;
  latestPubkey: string;
  op?: Event;
};

type Slice = { items: SliceItem[]; nextCursor: number | null; done: boolean };

function threadIdOf(e: Event): string | undefined {
  return e.kind === 11 ? e.id : tag(e, "E");
}

// Walk the combined OP + reply stream newest-first, collecting up to `n` unique
// threads not already shown. The first event seen for a thread defines its
// activity timestamp.
async function fetchActivitySlice(
  q: Query,
  groupId: string,
  until: number,
  exclude: Set<string>,
  n: number,
): Promise<Slice> {
  const collected = new Map<string, SliceItem>();
  let cur = until;
  let done = false;

  for (let i = 0; i < WALK_MAX_ITERS && collected.size < n; i++) {
    const events = await q({
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
      if (!id || exclude.has(id)) continue;
      const seen = collected.get(id);
      if (seen) {
        // Grab the OP from the stream when a thread was first seen via a reply,
        // so we avoid the by-id backfill the group relay truncates
        if (!seen.op && e.kind === 11) seen.op = e;
        continue;
      }
      if (collected.size >= n) continue; // Page full; keep scanning for OPs
      collected.set(id, {
        id,
        latestAt: e.created_at,
        latestPubkey: e.pubkey,
        op: e.kind === 11 ? e : undefined,
      });
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

// Chronological-by-creation slice: just OPs ordered by created_at. No reply
// data is needed to order them (stable cursor), keeping the path cheap; reply
// counts are still attached later via enrichment.
async function fetchNewSlice(
  q: Query,
  groupId: string,
  until: number,
  exclude: Set<string>,
  n: number,
): Promise<Slice> {
  const ops = await q({
    kinds: [11],
    "#h": [groupId],
    until,
    limit: n + 10, // headroom for boundary OPs re-read at the inclusive cursor
  });
  ops.sort((a, b) => b.created_at - a.created_at);
  const fresh = ops.filter((e) => !exclude.has(e.id));
  const slice = fresh.slice(0, n);
  const items: SliceItem[] = slice.map((op) => ({
    id: op.id,
    latestAt: op.created_at,
    latestPubkey: op.pubkey,
    op,
  }));
  const done = ops.length < n + 10;
  const last = slice[slice.length - 1] ?? ops[ops.length - 1];
  const nextCursor = last ? last.created_at : null;
  return { items, nextCursor, done };
}

async function enrichWithReplies(
  q: Query,
  groupId: string,
  items: SliceItem[],
  snapshotAt: number,
): Promise<Map<string, { count: number; repliers: string[] }>> {
  const result = new Map<string, { count: number; repliers: string[] }>();
  if (items.length === 0) return result;
  const replies = await q({
    kinds: [1111],
    "#h": [groupId],
    "#E": items.map((it) => it.id),
    until: snapshotAt,
    limit: 5000,
  });
  const acc = new Map<string, { count: number; pubkeys: Set<string> }>();
  for (const r of replies) {
    const root = tag(r, "E");
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
  q: Query,
  groupId: string,
  items: SliceItem[],
  snapshotAt: number,
): Promise<ThreadData[]> {
  const missing = items.filter((it) => !it.op);
  if (missing.length > 0) {
    const fetched = await Promise.all(
      missing.map((it) => q({ kinds: [11], "#h": [groupId], ids: [it.id] })),
    );
    const byId = new Map<string, Event>();
    for (const evs of fetched) for (const e of evs) byId.set(e.id, e);
    for (const it of items) if (!it.op) it.op = byId.get(it.id);
  }
  const enriched = await enrichWithReplies(q, groupId, items, snapshotAt);
  const out: ThreadData[] = [];
  for (const it of items) {
    const op = it.op;
    if (!op) continue; // OP missing (deleted/unavailable) — drop the row
    const e = enriched.get(it.id);
    out.push({
      id: it.id,
      title: tag(op, "title") ?? "(untitled)",
      labels: tags(op, "t"),
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

// One page of a group's thread listing, in the given sort order.
export async function fetchThreadPage(
  q: Query,
  groupId: string,
  req: PageRequest,
): Promise<ThreadPage> {
  const exclude = req.exclude ?? new Set<string>();
  const n = req.n ?? PAGE_SIZE;
  const slice =
    req.sort === "new"
      ? await fetchNewSlice(q, groupId, req.until, exclude, n)
      : await fetchActivitySlice(q, groupId, req.until, exclude, n);
  const threads = await buildThreads(q, groupId, slice.items, req.snapshotAt);
  return { threads, nextCursor: slice.nextCursor, done: slice.done };
}

export function threadPagePubkeys(threads: ThreadData[]): string[] {
  const set = new Set<string>();
  for (const t of threads) {
    set.add(t.authorPubkey);
    set.add(t.latestPubkey);
    for (const p of t.replierPubkeys) set.add(p);
  }
  return [...set];
}
