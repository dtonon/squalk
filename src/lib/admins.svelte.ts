import { page } from "$app/state";
import { MODE } from "$lib/config";
import { groupStore } from "$lib/group.svelte";
import { queryForum } from "$lib/relay";
import { fetchRoomAdmins } from "$lib/forum/groups";

// room id -> admin pubkeys (NIP-29 kind 39001 `p` tags), across all rooms.
let byRoom = $state<Record<string, string[]>>({});
let loaded = $state(false);
let loadedKey = "";

// Until the live fetch lands, the server snapshot (if any) stands in.
export const roomAdminsStore = {
  get byRoom() {
    return loaded ? byRoom : (page.data.shell?.adminsByRoom ?? {});
  },
  get loaded() {
    return loaded || !!page.data.shell;
  },
};

// Single source of truth for "who is an admin": the union of every room's
// admins in full mode, or the one group's admins in simple mode.
export const adminPubkeys = {
  get list(): string[] {
    return MODE === "full"
      ? [...new Set(Object.values(roomAdminsStore.byRoom).flat())]
      : (groupStore.data?.admins ?? []);
  },
  get loaded(): boolean {
    return MODE === "full" ? roomAdminsStore.loaded : groupStore.loaded;
  },
};

// Per-group admin check. NIP-29 roles are scoped to a group, so a delete
// button must gate on the post's own group, not the cross-room union above.
export function isGroupAdmin(
  pubkey: string | undefined,
  groupId: string | undefined,
): boolean {
  if (!pubkey || !groupId) return false;
  return MODE === "full"
    ? (roomAdminsStore.byRoom[groupId]?.includes(pubkey) ?? false)
    : (groupStore.data?.admins?.includes(pubkey) ?? false);
}

export async function loadRoomAdmins(roomIds: string[]) {
  if (roomIds.length === 0) return;
  const key = [...roomIds].sort().join(",");
  if (key === loadedKey) return;
  loadedKey = key;

  try {
    byRoom = await fetchRoomAdmins(queryForum, roomIds);
  } finally {
    loaded = true;
  }
}
