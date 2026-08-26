import type { Event } from "@nostr/tools/core";
import { tag, type Query } from "./query";

export type UserPost = {
  id: string;
  threadId: string; // the root thread; equals `id` for a root post
  title: string; // thread title, empty when the root is unreachable
  groupId: string;
  createdAt: number;
  content: string;
};

export type UserPostKind = "roots" | "replies";

export type UserPostPage = {
  items: UserPost[];
  done: boolean; // no older posts left
};

export type UserPosts = Record<UserPostKind, UserPostPage>;

// Posts per "Show more" step
export const USER_POSTS_PAGE = 20;
const CURSOR_HEADROOM = 10; // boundary events re-read at the inclusive cursor

export type UserPostPageRequest = {
  groupId?: string; // scope to one group (simple mode)
  until?: number; // oldest loaded timestamp, inclusive
  exclude?: Set<string>; // ids already shown
  n?: number;
};

function newestFirst(events: Event[]): Event[] {
  return [...events].sort((a, b) => b.created_at - a.created_at);
}

// One page of a user's root posts (kind 11) or replies (kind 1111), newest
// first, older than the cursor. Without `groupId` every group the relay
// serves the caller counts.
export async function fetchUserPostPage(
  q: Query,
  pubkey: string,
  kind: UserPostKind,
  req: UserPostPageRequest = {},
): Promise<UserPostPage> {
  const n = req.n ?? USER_POSTS_PAGE;
  const exclude = req.exclude ?? new Set<string>();
  const events = await q({
    kinds: [kind === "roots" ? 11 : 1111],
    authors: [pubkey],
    ...(req.groupId ? { "#h": [req.groupId] } : {}),
    ...(req.until ? { until: req.until } : {}),
    limit: n + CURSOR_HEADROOM,
  });
  const fresh = newestFirst(events).filter(
    (e) => !exclude.has(e.id) && (kind === "roots" || tag(e, "E")),
  );
  const slice = fresh.slice(0, n);
  // Finished only when everything fresh fits the page and the relay had
  // nothing beyond the requested window
  const done = fresh.length <= n && events.length < n + CURSOR_HEADROOM;

  // Replies take their title from the root thread
  const titles = new Map<string, string>();
  if (kind === "replies" && slice.length > 0) {
    const rootIds = [...new Set(slice.map((e) => tag(e, "E")!))];
    const roots = await q({ kinds: [11], ids: rootIds });
    for (const e of roots) titles.set(e.id, tag(e, "title") ?? "(untitled)");
  }

  const items = slice.map((e) => {
    const threadId = kind === "roots" ? e.id : tag(e, "E")!;
    return {
      id: e.id,
      threadId,
      title:
        kind === "roots"
          ? (tag(e, "title") ?? "(untitled)")
          : (titles.get(threadId) ?? ""),
      groupId: tag(e, "h") ?? req.groupId ?? "",
      createdAt: e.created_at,
      content: e.content,
    };
  });
  return { items, done };
}

// The first page of both columns.
export async function fetchUserPosts(
  q: Query,
  pubkey: string,
  groupId?: string,
): Promise<UserPosts> {
  const [roots, replies] = await Promise.all([
    fetchUserPostPage(q, pubkey, "roots", { groupId }),
    fetchUserPostPage(q, pubkey, "replies", { groupId }),
  ]);
  return { roots, replies };
}

// Cursor for the page after `page`: the oldest timestamp shown, inclusive
// (the ids already shown are excluded on the next read).
export function nextCursor(page: UserPostPage): number | undefined {
  const last = page.items[page.items.length - 1];
  return last?.createdAt;
}
