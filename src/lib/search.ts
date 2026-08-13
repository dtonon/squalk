import type { Event } from "@nostr/tools/core";
import type { Filter } from "@nostr/tools/filter";
import { queryForum } from "$lib/relay";
import { bestMatch } from "$lib/textMatch";
import { GROUP_ID, MODE } from "$lib/config";
import { groupsStore } from "$lib/groups.svelte";

export type SearchResult = {
  threadId: string;
  title: string;
  snippet: string;
  matchKind: "thread" | "reply";
  createdAt: number;
};

// Window the snippet around the best match (full phrase > longest
// contiguous run > densest single-term cluster, per textMatch rules). The
// score ranks how well this content matched, so dedupe can keep the best
// snippet per thread and the result list can order its tiers.
function snippetOf(
  content: string,
  query: string,
): { text: string; score: number } {
  const flat = content.replace(/\s+/g, " ").trim();
  const MAX = 140;
  const { anchor, score } = bestMatch(flat, query, MAX - 40);

  if (flat.length <= MAX) return { text: flat, score };
  if (anchor <= 40) return { text: flat.slice(0, MAX) + "…", score };
  const start = anchor - 40;
  const end = Math.min(flat.length, start + MAX);
  return {
    text: "…" + flat.slice(start, end) + (end < flat.length ? "…" : ""),
    score,
  };
}

// NIP-50 search over the forum relay: thread OPs (kind 11) and replies
// (kind 1111), deduped by thread. Simple mode scopes to the single group;
// full mode spans every visible room. The group scope is applied client-side
// on the `h` tag: pyramid returns nothing when `search` is combined with a
// `#h` filter.
export async function searchThreads(query: string): Promise<SearchResult[]> {
  const filter: Filter = { kinds: [11, 1111], search: query, limit: 30 };
  const groups =
    MODE === "simple"
      ? new Set([GROUP_ID])
      : new Set(groupsStore.list.map((g) => g.id));

  const all = await queryForum(filter, { label: "search" });
  const events = all.filter((e) => {
    const h = e.tags.find((t) => t[0] === "h")?.[1];
    return h !== undefined && (groups.size === 0 || groups.has(h));
  });

  type Candidate = SearchResult & { score: number };
  const byThread = new Map<string, Candidate>();
  const needTitle: Candidate[] = [];
  for (const e of events) {
    const isOp = e.kind === 11;
    const threadId = isOp ? e.id : e.tags.find((t) => t[0] === "E")?.[1];
    if (!threadId) continue;
    const title = isOp
      ? (e.tags.find((t) => t[0] === "title")?.[1] ?? "(untitled)")
      : "";
    const { text, score } = snippetOf(e.content, query);
    const existing = byThread.get(threadId);
    if (!existing) {
      const r: Candidate = {
        threadId,
        title,
        snippet: text,
        matchKind: isOp ? "thread" : "reply",
        createdAt: e.created_at,
        score,
      };
      byThread.set(threadId, r);
      if (!isOp) needTitle.push(r);
    } else {
      // Keep the snippet of whichever event matched the query best
      if (score > existing.score) {
        existing.snippet = text;
        existing.matchKind = isOp ? "thread" : "reply";
        existing.score = score;
      }
      if (isOp && !existing.title) existing.title = title;
    }
  }

  // Backfill titles for reply-only matches; the group relay truncates
  // multi-id queries, so fetch each OP on its own
  await Promise.all(
    needTitle.map(async (r) => {
      if (r.title) return; // The OP appeared in the same result set
      const ops = await queryForum({ kinds: [11], ids: [r.threadId] });
      const op: Event | undefined = ops[0];
      r.title = op?.tags.find((t) => t[0] === "title")?.[1] ?? "(untitled)";
    }),
  );

  // Tiered ordering: full-phrase matches, then contiguous multi-word runs
  // (longest first), then single-word matches capped to keep noise down.
  // Within a tier the relay's relevance (arrival) order is preserved —
  // Array.prototype.sort is stable.
  const SINGLES_LIMIT = 5;
  let singles = 0;
  return [...byThread.values()]
    .sort((a, b) => b.score - a.score)
    .filter((r) => r.score >= 100 || ++singles <= SINGLES_LIMIT);
}
