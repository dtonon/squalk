import { SimplePool } from "@nostr/tools";
import { RELAY_URL, MODE } from "$lib/config";
import { groupStore } from "$lib/group.svelte";

// room id -> admin pubkeys (NIP-29 kind 39001 `p` tags), across all rooms.
let byRoom = $state<Record<string, string[]>>({});
let loaded = $state(false);
let loadedKey = "";

export const roomAdminsStore = {
  get byRoom() {
    return byRoom;
  },
  get loaded() {
    return loaded;
  },
};

// Single source of truth for "who is an admin": the union of every room's
// admins in full mode, or the one group's admins in simple mode.
export const adminPubkeys = {
  get list(): string[] {
    return MODE === "full"
      ? [...new Set(Object.values(byRoom).flat())]
      : (groupStore.data?.admins ?? []);
  },
  get loaded(): boolean {
    return MODE === "full" ? loaded : groupStore.loaded;
  },
};

export async function loadRoomAdmins(roomIds: string[]) {
  if (roomIds.length === 0) return;
  const key = [...roomIds].sort().join(",");
  if (key === loadedKey) return;
  loadedKey = key;

  const pool = new SimplePool();
  try {
    const events = await pool.querySync([RELAY_URL], {
      kinds: [39001],
      "#d": roomIds,
    });
    const map: Record<string, string[]> = {};
    for (const e of events) {
      const d = e.tags.find((t) => t[0] === "d")?.[1];
      if (!d) continue;
      map[d] = e.tags.filter((t) => t[0] === "p" && t[1]).map((t) => t[1]);
    }
    byRoom = map;
  } finally {
    loaded = true;
    pool.close([RELAY_URL]);
  }
}
