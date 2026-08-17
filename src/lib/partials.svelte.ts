import { page } from "$app/state";
import { adminPubkeys } from "$lib/admins.svelte";
import { queryForum } from "$lib/relay";
import {
  fetchPartials,
  pickPartial,
  type Partial,
  type PartialSlot,
} from "$lib/forum/partials";

export type { Partial, PartialSlot };

let all = $state<Partial[]>([]);
let loaded = $state(false);

// Until the live fetch lands, the server snapshot (if any) stands in.
export const partialsStore = {
  get(slot: PartialSlot): Partial | undefined {
    const source = loaded ? all : (page.data.shell?.partials ?? []);
    return pickPartial(source, slot, adminPubkeys.list);
  },
  get loaded() {
    return loaded || !!page.data.shell;
  },
};

export async function loadPartials() {
  try {
    all = await fetchPartials(queryForum);
  } finally {
    loaded = true;
  }
}
