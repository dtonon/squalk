import { tag, tags, type Query } from "./query";

export type PostData = {
  id: string;
  pubkey: string;
  createdAt: number;
  content: string;
};

export type ThreadDetail = {
  id: string;
  title: string;
  labels: string[];
  groupId: string; // the thread's NIP-29 group (its `h` tag)
  op: PostData;
  replies: PostData[];
};

// A thread (kind 11) with its flat replies (kind 1111), oldest first. Null
// when the relay returns nothing: no such thread, or one the visitor can't
// read. `fallbackGroup` covers OPs missing an `h` tag.
export async function fetchThread(
  q: Query,
  id: string,
  fallbackGroup = "",
): Promise<ThreadDetail | null> {
  const [threadEvents, replyEvents] = await Promise.all([
    q({ kinds: [11], ids: [id] }),
    q({ kinds: [1111], "#E": [id] }),
  ]);
  const event = threadEvents[0];
  if (!event) return null;
  const replies = replyEvents.sort((a, b) => a.created_at - b.created_at);
  return {
    id: event.id,
    title: tag(event, "title") ?? "(untitled)",
    labels: tags(event, "t"),
    groupId: tag(event, "h") ?? fallbackGroup,
    op: {
      id: event.id,
      pubkey: event.pubkey,
      createdAt: event.created_at,
      content: event.content,
    },
    replies: replies.map((r) => ({
      id: r.id,
      pubkey: r.pubkey,
      createdAt: r.created_at,
      content: r.content,
    })),
  };
}

export function threadAuthors(t: ThreadDetail): string[] {
  return [...new Set([t.op.pubkey, ...t.replies.map((r) => r.pubkey)])];
}
