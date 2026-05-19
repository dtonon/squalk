import { GROUP_ID, MODE } from "$lib/config";

// The group the user is currently acting within (posting, chatting, joining).
// Simple mode has exactly one group; full mode follows the room or thread being
// viewed. GROUP_ID is never assumed in full mode — this is the single source of
// truth for "which group".
let current = $state<string>(MODE === "full" ? "" : GROUP_ID);

export const activeGroup = {
  get id() {
    return current;
  },
};

export function setActiveGroup(id: string) {
  if (id) current = id;
}
