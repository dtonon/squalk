import { page } from "$app/state";
import { loadNostrUser, type NostrUser } from "$lib/gadgets";
import { ensureForumRelay } from "$lib/relay";
import { ingestNostrUser } from "$lib/profiles.svelte";
import { relayQuery } from "$lib/forum/query";
import {
  fetchOverview,
  overviewPubkeys,
  type RecentThread,
  type RoomActivity,
} from "$lib/forum/overview";

export type { RecentThread, RoomActivity };

let activity = $state<Record<string, RoomActivity>>({});
let admins = $state<Record<string, string>>({}); // room id -> first admin pubkey
let recent = $state<RecentThread[]>([]);
let profiles = $state<Record<string, NostrUser>>({});
let loading = $state(false);
let loadedKey = ""; // room-id set last loaded for, to avoid redundant refetches
let settled = $state(false); // first live load finished

// Until the live fetch lands, the server snapshot (if any) stands in.
function fallback() {
  return settled ? null : (page.data.overview ?? null);
}

export const overviewStore = {
  get activity() {
    return fallback()?.activity ?? activity;
  },
  get admins() {
    return fallback()?.admins ?? admins;
  },
  get recent() {
    return fallback()?.recent ?? recent;
  },
  get profiles() {
    const base = page.data.overview?.profiles;
    return base ? { ...base, ...profiles } : profiles;
  },
  get loading() {
    return loading;
  },
};

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
  try {
    const q = relayQuery(await ensureForumRelay());
    const o = await fetchOverview(q, roomIds);
    activity = o.activity;
    admins = o.admins;
    recent = o.recent;
    settled = true;
    overviewPubkeys(o).forEach(loadProfile);
  } finally {
    loading = false;
  }
}
