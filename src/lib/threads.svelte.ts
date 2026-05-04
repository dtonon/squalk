import { Relay } from "@nostr/tools";
import type { Event } from "@nostr/tools/core";
import type { Filter } from "@nostr/tools/filter";
import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";
import { RELAY_URL, GROUP_ID } from "$lib/config";
import { ingestNostrUser } from "$lib/profiles.svelte";

const N_OPS = 50;
const N_REPLY_WINDOW = 200;

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
  ingestNostrUser(user);
}

function querySync(relay: Relay, filter: Filter): Promise<Event[]> {
  return new Promise((resolve) => {
    const events: Event[] = [];
    const sub = relay.subscribe([filter], {
      onevent(e) {
        events.push(e);
      },
      oneose() {
        sub.close();
        resolve(events);
      },
      onclose() {
        resolve(events);
      },
    });
  });
}

export async function loadThreads() {
  const relay = await Relay.connect(RELAY_URL);
  try {
    // Parallel: latest OPs + latest replies window
    const [opEvents, replyEvents] = await Promise.all([
      querySync(relay, { kinds: [11], "#h": [GROUP_ID], limit: N_OPS }),
      querySync(relay, { kinds: [1111], "#h": [GROUP_ID], limit: N_REPLY_WINDOW }),
    ]);

    // Aggregate reply data per root thread id
    type ReplyAgg = {
      latestAt: number;
      latestPubkey: string;
      pubkeys: Set<string>;
    };
    const replyMap = new Map<string, ReplyAgg>();
    for (const r of replyEvents) {
      const rootId = r.tags.find((t) => t[0] === "E")?.[1];
      if (!rootId) continue;
      let agg = replyMap.get(rootId);
      if (!agg) {
        agg = { latestAt: 0, latestPubkey: r.pubkey, pubkeys: new Set() };
        replyMap.set(rootId, agg);
      }
      agg.pubkeys.add(r.pubkey);
      if (r.created_at > agg.latestAt) {
        agg.latestAt = r.created_at;
        agg.latestPubkey = r.pubkey;
      }
    }

    // Backfill OPs that have recent replies but fell outside the OP window
    const opIds = new Set(opEvents.map((e) => e.id));
    const missingIds = [...replyMap.keys()].filter((id) => !opIds.has(id));
    let extraOps: Event[] = [];
    if (missingIds.length > 0) {
      extraOps = await querySync(relay, {
        kinds: [11],
        "#h": [GROUP_ID],
        ids: missingIds,
      });
    }

    // Build candidate threads, computing latestAt from OP + reply window
    const candidates: ThreadData[] = [...opEvents, ...extraOps].map((e) => {
      const agg = replyMap.get(e.id);
      const replierPubkeys = agg
        ? [...agg.pubkeys].filter((p) => p !== e.pubkey).slice(0, 4)
        : [];
      return {
        id: e.id,
        title: e.tags.find((t) => t[0] === "title")?.[1] ?? "(untitled)",
        labels: e.tags.filter((t) => t[0] === "t" && t[1]).map((t) => t[1]),
        authorPubkey: e.pubkey,
        createdAt: e.created_at,
        replyCount: 0,
        latestAt: agg ? Math.max(e.created_at, agg.latestAt) : e.created_at,
        latestPubkey: agg ? agg.latestPubkey : e.pubkey,
        replierPubkeys,
      };
    });

    // Sort by last activity, keep top N_OPS
    candidates.sort((a, b) => b.latestAt - a.latestAt);
    const top = candidates.slice(0, N_OPS);
    threads = top;

    // Prefetch profiles
    for (const t of top) {
      loadProfile(t.authorPubkey);
      for (const p of t.replierPubkeys) loadProfile(p);
    }

    // Exact reply counts: single follow-up query bucketed by root.
    // (Pyramid's NIP-45 COUNT ignores group storage, so we count events directly.)
    const topIds = top.map((t) => t.id);
    const allReplies = await querySync(relay, {
      kinds: [1111],
      "#h": [GROUP_ID],
      "#E": topIds,
      limit: 5000,
    });
    const countMap = new Map<string, number>();
    for (const r of allReplies) {
      const rootId = r.tags.find((t) => t[0] === "E")?.[1];
      if (!rootId) continue;
      countMap.set(rootId, (countMap.get(rootId) ?? 0) + 1);
    }
    threads = top.map((t) => ({ ...t, replyCount: countMap.get(t.id) ?? 0 }));
  } finally {
    relay.close();
  }
}
