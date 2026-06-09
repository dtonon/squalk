import { queryForum } from "./relay";

// A note/nevent that resolves to a forum thread (kind 11) or reply (kind 1111).
export type ThreadRef = {
  threadId: string;
  replyId?: string;
  title: string;
  pubkey: string;
};

const cache = new Map<string, Promise<ThreadRef | null>>();

function titleOf(tags: string[][]): string {
  return tags.find((t) => t[0] === "title")?.[1] ?? "(untitled)";
}

async function doResolve(id: string): Promise<ThreadRef | null> {
  try {
    const events = await queryForum({ ids: [id], kinds: [11, 1111] });
    const ev = events[0];
    if (!ev) return null;

    if (ev.kind === 11)
      return { threadId: ev.id, title: titleOf(ev.tags), pubkey: ev.pubkey };

    // Reply: recover the root thread from its uppercase root tag.
    const root = ev.tags.find((t) => t[0] === "E");
    const rootId = root?.[1];
    if (!rootId) return null;
    const threads = await queryForum({ ids: [rootId], kinds: [11] });
    const thread = threads[0];
    return {
      threadId: rootId,
      replyId: ev.id,
      title: thread ? titleOf(thread.tags) : "(untitled)",
      pubkey: thread?.pubkey ?? root?.[3] ?? ev.pubkey,
    };
  } catch {
    return null;
  }
}

// Resolve (and cache) a note/nevent id to a forum thread reference, or null if
// it is not a thread/reply reachable on our relay.
export function resolveThreadRef(id: string): Promise<ThreadRef | null> {
  let p = cache.get(id);
  if (!p) {
    p = doResolve(id);
    cache.set(id, p);
  }
  return p;
}

// In-app URL for a resolved reference.
export function threadRefHref(ref: ThreadRef): string {
  return ref.replyId
    ? `/thread/${ref.threadId}#post-${ref.replyId}`
    : `/thread/${ref.threadId}`;
}
