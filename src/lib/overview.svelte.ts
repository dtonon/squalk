import type { AbstractRelay } from "@nostr/tools/abstract-relay";
import type { Event } from "@nostr/tools/core";
import type { Filter } from "@nostr/tools/filter";
import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";
import { ensureForumRelay } from "$lib/relay";
import { ingestNostrUser } from "$lib/profiles.svelte";

export type RoomActivity = {
  latestAt: number;
  latestPubkey: string;
};

export type RecentThread = {
  id: string;
  title: string;
  groupId: string;
  authorPubkey: string;
  createdAt: number;
};

let activity = $state<Record<string, RoomActivity>>({});
let admins = $state<Record<string, string>>({}); // room id -> first admin pubkey
let recent = $state<RecentThread[]>([]);
let profiles = $state<Record<string, NostrUser>>({});
let loading = $state(false);
let loadedKey = ""; // room-id set last loaded for, to avoid redundant refetches

export const overviewStore = {
  get activity() {
    return activity;
  },
  get admins() {
    return admins;
  },
  get recent() {
    return recent;
  },
  get profiles() {
    return profiles;
  },
  get loading() {
    return loading;
  },
};

function querySync(relay: AbstractRelay, filter: Filter): Promise<Event[]> {
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

async function loadProfile(pubkey: string) {
  if (profiles[pubkey]) return;
  const user = await loadNostrUser(pubkey);
  profiles[pubkey] = user;
  ingestNostrUser(user);
}

// Builds the full-mode landing data: each room's last activity (for the room
// cards) and the most recent threads across every room (for the side panel).
export async function loadOverview(roomIds: string[]) {
  if (roomIds.length === 0) return;
  const key = [...roomIds].sort().join(",");
  if (key === loadedKey) return;
  loadedKey = key;

  loading = true;
  const relay = await ensureForumRelay();
  try {
    // One tiny query per room for its newest event (thread or reply).
    const latest = await Promise.all(
      roomIds.map((id) =>
        querySync(relay, { kinds: [11, 1111], "#h": [id], limit: 1 }),
      ),
    );
    const act: Record<string, RoomActivity> = {};
    roomIds.forEach((id, i) => {
      const e = latest[i][0];
      if (e) act[id] = { latestAt: e.created_at, latestPubkey: e.pubkey };
    });
    activity = act;

    // Each room's admin (NIP-29 kind 39001, first `p` tag) for the card byline.
    const adminEvents = await Promise.all(
      roomIds.map((id) => querySync(relay, { kinds: [39001], "#d": [id] })),
    );
    const adm: Record<string, string> = {};
    roomIds.forEach((id, i) => {
      const pk = adminEvents[i][0]?.tags.find((t) => t[0] === "p")?.[1];
      if (pk) adm[id] = pk;
    });
    admins = adm;

    // Most recent discussions (thread OPs) across all rooms combined.
    const threads = await querySync(relay, {
      kinds: [11],
      "#h": roomIds,
      limit: 20,
    });
    threads.sort((a, b) => b.created_at - a.created_at);
    recent = threads.map((e) => ({
      id: e.id,
      title: e.tags.find((t) => t[0] === "title")?.[1] ?? "(untitled)",
      groupId: e.tags.find((t) => t[0] === "h")?.[1] ?? "",
      authorPubkey: e.pubkey,
      createdAt: e.created_at,
    }));

    for (const a of Object.values(act)) loadProfile(a.latestPubkey);
    for (const pk of Object.values(adm)) loadProfile(pk);
    for (const t of recent) loadProfile(t.authorPubkey);
  } finally {
    // shared forum connection is long-lived — don't close it here
    loading = false;
  }
}
