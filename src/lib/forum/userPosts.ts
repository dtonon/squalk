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

export type UserPosts = { roots: UserPost[]; replies: UserPost[] };

export const USER_POSTS_LIMIT = 50;

function newestFirst(events: Event[]): Event[] {
  return [...events].sort((a, b) => b.created_at - a.created_at);
}

// A user's latest root posts (kind 11) and replies (kind 1111). `groupId`
// scopes the lookup to one group (simple mode); otherwise every group the
// relay serves the caller counts.
export async function fetchUserPosts(
  q: Query,
  pubkey: string,
  groupId?: string,
): Promise<UserPosts> {
  const scope = groupId ? { "#h": [groupId] } : {};
  const [ops, replies] = await Promise.all([
    q({ kinds: [11], authors: [pubkey], ...scope, limit: USER_POSTS_LIMIT }),
    q({ kinds: [1111], authors: [pubkey], ...scope, limit: USER_POSTS_LIMIT }),
  ]);

  const rootIds = [
    ...new Set(
      replies.map((r) => tag(r, "E")).filter((id): id is string => !!id),
    ),
  ];
  const titles = new Map<string, string>();
  if (rootIds.length > 0) {
    const roots = await q({ kinds: [11], ids: rootIds });
    for (const e of roots) titles.set(e.id, tag(e, "title") ?? "(untitled)");
  }

  return {
    roots: newestFirst(ops).map((e) => ({
      id: e.id,
      threadId: e.id,
      title: tag(e, "title") ?? "(untitled)",
      groupId: tag(e, "h") ?? groupId ?? "",
      createdAt: e.created_at,
      content: e.content,
    })),
    replies: newestFirst(replies)
      .filter((e) => tag(e, "E"))
      .map((e) => {
        const threadId = tag(e, "E")!;
        return {
          id: e.id,
          threadId,
          title: titles.get(threadId) ?? "",
          groupId: tag(e, "h") ?? groupId ?? "",
          createdAt: e.created_at,
          content: e.content,
        };
      }),
  };
}
