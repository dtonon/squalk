import type { Event } from "@nostr/tools/core";
import type { Filter } from "@nostr/tools/filter";
import { queryForum } from "$lib/relay";
import { GROUP_ID, MODE } from "$lib/config";
import { groupsStore } from "$lib/groups.svelte";

export type SearchResult = {
  threadId: string;
  title: string;
  snippet: string;
  matchKind: "thread" | "reply";
  createdAt: number;
};

// Window the snippet around the best term cluster: the anchor occurrence
// whose window covers the most distinct query terms, so a multi-word query
// excerpts the passage matching the whole phrase, not the first lone word.
// Ties go to the earliest position.
function snippetOf(content: string, query: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  const MAX = 140;
  if (flat.length <= MAX) return flat;
  const lower = flat.toLowerCase();
  const terms = [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))];

  const occurrences: { i: number; term: string }[] = [];
  for (const t of terms) {
    let i = 0;
    while ((i = lower.indexOf(t, i)) !== -1) {
      occurrences.push({ i, term: t });
      i += t.length;
    }
  }
  if (occurrences.length === 0) return flat.slice(0, MAX) + "…";
  occurrences.sort((a, b) => a.i - b.i);

  const span = MAX - 40; // Visible chars from the anchor to the window's end
  let best = occurrences[0];
  let bestScore = 0;
  for (const o of occurrences) {
    const seen = new Set<string>();
    for (const p of occurrences) {
      if (p.i >= o.i && p.i + p.term.length <= o.i + span) seen.add(p.term);
    }
    if (seen.size > bestScore) {
      bestScore = seen.size;
      best = o;
    }
  }

  if (best.i <= 40) return flat.slice(0, MAX) + "…";
  const start = best.i - 40;
  const end = Math.min(flat.length, start + MAX);
  return "…" + flat.slice(start, end) + (end < flat.length ? "…" : "");
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

  const byThread = new Map<string, SearchResult>();
  const opless: SearchResult[] = [];
  for (const e of events) {
    if (e.kind === 11) {
      const existing = byThread.get(e.id);
      // An OP match wins over a reply match on the same thread
      if (existing && existing.matchKind === "thread") continue;
      byThread.set(e.id, {
        threadId: e.id,
        title: e.tags.find((t) => t[0] === "title")?.[1] ?? "(untitled)",
        snippet: snippetOf(e.content, query),
        matchKind: "thread",
        createdAt: e.created_at,
      });
    } else {
      const root = e.tags.find((t) => t[0] === "E")?.[1];
      if (!root || byThread.has(root)) continue;
      const r: SearchResult = {
        threadId: root,
        title: "",
        snippet: snippetOf(e.content, query),
        matchKind: "reply",
        createdAt: e.created_at,
      };
      byThread.set(root, r);
      opless.push(r);
    }
  }

  // Backfill titles for reply-only matches; the group relay truncates
  // multi-id queries, so fetch each OP on its own
  await Promise.all(
    opless.map(async (r) => {
      const ops = await queryForum({ kinds: [11], ids: [r.threadId] });
      const op: Event | undefined = ops[0];
      r.title = op?.tags.find((t) => t[0] === "title")?.[1] ?? "(untitled)";
    }),
  );

  // Keep the relay's relevance order (arrival order); a thread keeps the
  // position of its best-ranked match
  return [...byThread.values()];
}
