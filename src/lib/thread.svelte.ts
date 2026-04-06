import { SimplePool } from "@nostr/tools";
import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";
import { RELAY_URL } from "$lib/config";
import { threads as mockThreads } from "$lib/mock";

const isNostrId = (id: string) => /^[0-9a-f]{64}$/.test(id);

export type PostData = {
  id: string;
  pubkey: string;
  createdAt: number;
  content: string;
};

type ThreadDetail = {
  id: string;
  title: string;
  op: PostData;
  replies: PostData[];
};

let detail = $state<ThreadDetail | null>(null);
let profiles = $state<Record<string, NostrUser>>({});

export const threadDetailStore = {
  get detail() { return detail; },
  get profiles() { return profiles; },
};

async function loadProfile(pubkey: string) {
  if (profiles[pubkey]) return;
  const user = await loadNostrUser(pubkey);
  profiles[pubkey] = user;
}

function loadMockThread(id: string) {
  const t = mockThreads.find((t) => t.id === id);
  if (!t) return;
  const toUnix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  detail = {
    id: t.id,
    title: t.title,
    op: { id: t.op.id, pubkey: t.op.author.pubkey, createdAt: toUnix(t.op.createdAt), content: t.op.content },
    replies: (t.op.replies ?? []).map((r) => ({
      id: r.id, pubkey: r.author.pubkey, createdAt: toUnix(r.createdAt), content: r.content,
    })),
  };
  const allAuthors = [t.op.author, ...(t.op.replies ?? []).map((r) => r.author)];
  for (const a of allAuthors) {
    profiles[a.pubkey] = {
      pubkey: a.pubkey, npub: a.pubkey, shortName: a.name, image: a.picture,
      metadata: { name: a.name, picture: a.picture },
      lastUpdated: 0,
    } as NostrUser;
  }
}

export async function loadThread(id: string) {
  detail = null;
  profiles = {};

  if (!isNostrId(id)) { await Promise.resolve(); loadMockThread(id); return; }

  const pool = new SimplePool();
  try {
    const [threadEvents, replyEvents] = await Promise.all([
      pool.querySync([RELAY_URL], { kinds: [11], ids: [id] }),
      pool.querySync([RELAY_URL], { kinds: [1111], "#E": [id] }),
    ]);

    const event = threadEvents[0];
    if (!event) return;

    const replies = replyEvents.sort((a, b) => a.created_at - b.created_at);

    detail = {
      id: event.id,
      title: event.tags.find((t) => t[0] === "title")?.[1] ?? "(untitled)",
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

    [event.pubkey, ...replies.map((r) => r.pubkey)].forEach(loadProfile);
  } finally {
    pool.close([RELAY_URL]);
  }
}
