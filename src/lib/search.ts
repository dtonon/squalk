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

function snippetOf(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? flat.slice(0, 140) + "…" : flat;
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
        snippet: snippetOf(e.content),
        matchKind: "thread",
        createdAt: e.created_at,
      });
    } else {
      const root = e.tags.find((t) => t[0] === "E")?.[1];
      if (!root || byThread.has(root)) continue;
      const r: SearchResult = {
        threadId: root,
        title: "",
        snippet: snippetOf(e.content),
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

  return [...byThread.values()].sort((a, b) => b.createdAt - a.createdAt);
}
