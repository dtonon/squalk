import { GROUP_ID, MODE } from "$lib/config";
import { queryForum } from "$lib/relay";
import { groupsStore } from "$lib/groups.svelte";

export type GroupMetadata = {
  name: string;
  picture?: string;
  about?: string;
  isPrivate: boolean;
  isClosed: boolean;
  isRestricted: boolean;
  isHidden: boolean;
  admins: string[];
};

// NIP-29 access flags: private = members-only read, restricted = members-only
// write, closed = join requests ignored, hidden = metadata hidden from non-members.
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
    const events = await queryForum({
      kinds: [39000, 39001],
      "#d": [GROUP_ID],
    });
    const event = events.find((e) => e.kind === 39000);
    if (!event) return;
    // Admins live in the NIP-29 kind 39001 event as `p` tags.
    const adminsEvent = events.find((e) => e.kind === 39001);
    const admins =
      adminsEvent?.tags.filter((t) => t[0] === "p").map((t) => t[1]) ?? [];
    group = {
      name: event.tags.find((t) => t[0] === "name")?.[1] ?? GROUP_ID,
      picture: event.tags.find((t) => t[0] === "picture")?.[1],
      about: event.tags.find((t) => t[0] === "about")?.[1],
      isPrivate: event.tags.some((t) => t[0] === "private"),
      isClosed: event.tags.some((t) => t[0] === "closed"),
      isRestricted: event.tags.some((t) => t[0] === "restricted"),
      isHidden: event.tags.some((t) => t[0] === "hidden"),
      admins,
    };
  } finally {
    loaded = true;
  }
}

// A group's access flags from whichever store holds them: full mode keeps every
// room in the groups list, simple mode has the single active group's metadata.
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
