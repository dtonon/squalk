import { page } from "$app/state";
import { queryForum } from "$lib/relay";
import { fetchGroups, type GroupSummary } from "$lib/forum/groups";

export type { GroupSummary };

let list = $state<GroupSummary[]>([]);
let loaded = $state(false);

// Until the live fetch lands, the server snapshot (if any) stands in.
export const groupsStore = {
  get list() {
    return loaded ? list : (page.data.shell?.groups ?? []);
  },
  get loaded() {
    return loaded || !!page.data.shell;
  },
};

export async function loadGroups() {
  try {
    list = await fetchGroups(queryForum);
  } finally {
    loaded = true;
  }
}
