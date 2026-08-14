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

export const partialsStore = {
  get(slot: PartialSlot): Partial | undefined {
    return pickPartial(all, slot, adminPubkeys.list);
  },
  get loaded() {
    return loaded;
  },
};

export async function loadPartials() {
  try {
    all = await fetchPartials(queryForum);
  } finally {
    loaded = true;
  }
}
