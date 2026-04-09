import { SimplePool } from "@nostr/tools";
import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";
import { RELAY_URL, GROUP_ID } from "$lib/config";

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

export const threadStore = {
  get threads() { return threads; },
  get profiles() { return profiles; },
};

async function loadProfile(pubkey: string) {
  if (profiles[pubkey]) return;
  const user = await loadNostrUser(pubkey);
  profiles[pubkey] = user;
}

export async function loadThreads() {
  const pool = new SimplePool();
  try {
    // Step 1: fetch threads
    const events = await pool.querySync([RELAY_URL], {
      kinds: [11],
      "#h": [GROUP_ID],
      limit: 50,
    });

    events.sort((a, b) => b.created_at - a.created_at);

    threads = events.map((e) => ({
      id: e.id,
      title: e.tags.find((t) => t[0] === "title")?.[1] ?? "(untitled)",
      labels: e.tags.filter((t) => t[0] === "t" && t[1]).map((t) => t[1]),
      authorPubkey: e.pubkey,
      createdAt: e.created_at,
      replyCount: 0,
      latestAt: e.created_at,
      latestPubkey: e.pubkey,
      replierPubkeys: [],
    }));

    events.forEach((e) => loadProfile(e.pubkey));

    if (events.length === 0) return;

    // Step 2: fetch replies for all threads in one request
    const replies = await pool.querySync([RELAY_URL], {
      kinds: [1111],
      "#E": events.map((e) => e.id),
    });

    // Aggregate per-thread reply data
    const replyMap = new Map<
      string,
      { count: number; latestAt: number; latestPubkey: string; pubkeys: Set<string> }
    >();

    for (const reply of replies) {
      const rootId = reply.tags.find((t) => t[0] === "E")?.[1];
      if (!rootId) continue;
      if (!replyMap.has(rootId)) {
        replyMap.set(rootId, {
          count: 0,
          latestAt: 0,
          latestPubkey: reply.pubkey,
          pubkeys: new Set(),
        });
      }
      const rd = replyMap.get(rootId)!;
      rd.count++;
      rd.pubkeys.add(reply.pubkey);
      if (reply.created_at > rd.latestAt) {
        rd.latestAt = reply.created_at;
        rd.latestPubkey = reply.pubkey;
      }
    }

    threads = threads.map((t) => {
      const rd = replyMap.get(t.id);
      if (!rd) return t;
      return {
        ...t,
        replyCount: rd.count,
        latestAt: rd.latestAt,
        latestPubkey: rd.latestPubkey,
        replierPubkeys: [...rd.pubkeys].slice(0, 4),
      };
    });

    replies.forEach((r) => loadProfile(r.pubkey));
  } finally {
    pool.close([RELAY_URL]);
  }
}
