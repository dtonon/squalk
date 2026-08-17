import { page } from "$app/state";
import { adminPubkeys } from "$lib/admins.svelte";
import { queryForum } from "$lib/relay";
import { fetchResources, type Resource } from "$lib/forum/resources";

export type { Resource };

let all = $state<Resource[]>([]);
let loaded = $state(false);

// Only admin-authored resources are surfaced: the relay query is open, so the
// admin set is the trust gate. Until the live fetch lands, the server
// snapshot (if any) stands in.
export const resourcesStore = {
  get list() {
    const admins = new Set(adminPubkeys.list);
    const source = loaded ? all : (page.data.shell?.resources ?? []);
    return source.filter((r) => admins.has(r.pubkey));
  },
  get loaded() {
    return loaded || !!page.data.shell;
  },
};

export async function loadResources() {
  try {
    all = await fetchResources(queryForum);
  } finally {
    loaded = true;
  }
}
