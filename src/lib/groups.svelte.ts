import { queryForum } from "$lib/relay";
import { fetchGroups, type GroupSummary } from "$lib/forum/groups";

export type { GroupSummary };

let list = $state<GroupSummary[]>([]);
let loaded = $state(false);

export const groupsStore = {
  get list() {
    return list;
  },
  get loaded() {
    return loaded;
  },
};

export async function loadGroups() {
  try {
    list = await fetchGroups(queryForum);
  } finally {
    loaded = true;
  }
}
