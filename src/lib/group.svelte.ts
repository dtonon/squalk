import { GROUP_ID, MODE } from "$lib/config";
import { queryForum } from "$lib/relay";
import { groupsStore } from "$lib/groups.svelte";
import { fetchGroup, type GroupMetadata } from "$lib/forum/groups";

export type { GroupMetadata };

export type GroupFlags = {
  isPrivate: boolean;
  isClosed: boolean;
  isRestricted: boolean;
  isHidden: boolean;
};

let group = $state<GroupMetadata | null>(null);
let loaded = $state(false);

export const groupStore = {
  get data() {
    return group;
  },
  get loaded() {
    return loaded;
  },
};

export async function loadGroup() {
  try {
    group = (await fetchGroup(queryForum, GROUP_ID)) ?? group;
  } finally {
    loaded = true;
  }
}

export function getGroupFlags(groupId: string): GroupFlags | null {
  if (MODE === "full") {
    const g = groupsStore.list.find((x) => x.id === groupId);
    if (!g) return null;
    return {
      isPrivate: g.flags.includes("private"),
      isClosed: g.flags.includes("closed"),
      isRestricted: g.flags.includes("restricted"),
      isHidden: g.flags.includes("hidden"),
    };
  }
  if (!group) return null;
  return {
    isPrivate: group.isPrivate,
    isClosed: group.isClosed,
    isRestricted: group.isRestricted,
    isHidden: group.isHidden,
  };
}

// Display name for a group from whichever store holds it, falling back to the
// id when metadata hasn't loaded.
export function getGroupName(groupId: string): string {
  if (MODE === "full") {
    return groupsStore.list.find((x) => x.id === groupId)?.name ?? groupId;
  }
  return group?.name ?? groupId;
}
