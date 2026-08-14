import { adminPubkeys } from "$lib/admins.svelte";
import { queryForum } from "$lib/relay";
import { fetchResources, type Resource } from "$lib/forum/resources";

export type { Resource };

let all = $state<Resource[]>([]);
let loaded = $state(false);

// Only admin-authored resources are surfaced: the relay query is open, so the
// admin set is the trust gate.
export const resourcesStore = {
  get list() {
    const admins = new Set(adminPubkeys.list);
    return all.filter((r) => admins.has(r.pubkey));
  },
  get loaded() {
    return loaded;
  },
};

export async function loadResources() {
  try {
    all = await fetchResources(queryForum);
  } finally {
    loaded = true;
  }
}
