import { adminPubkeys } from "$lib/admins.svelte";
import { queryForum } from "$lib/relay";

// Named slots a partial can fill. The NIP-23 `d` tag carries the slot name.
export type PartialSlot = "home" | "contacts";
const SLOTS = new Set<string>(["home", "contacts"]);

export type Partial = {
  id: string;
  slot: PartialSlot;
  title: string;
  content: string; // markdown body
  pubkey: string;
  createdAt: number;
};

let all = $state<Partial[]>([]);
let loaded = $state(false);

export const partialsStore = {
  // The newest admin-authored partial for a slot, or undefined. The relay query
  // is open, so the trusted admin set is the gate; resolving the winner here
  // (rather than at load time) keeps a non-admin from shadowing it with a newer
  // event, and picks up the admin set once it finishes loading in full mode.
  get(slot: PartialSlot): Partial | undefined {
    const admins = new Set(adminPubkeys.list);
    let best: Partial | undefined;
    for (const p of all) {
      if (p.slot !== slot || !admins.has(p.pubkey)) continue;
      if (!best || p.createdAt > best.createdAt) best = p;
    }
    return best;
  },
  get loaded() {
    return loaded;
  },
};

// Partials are kind 30023 (NIP-23 long-form) tagged ["t", "squalk-partial"];
// the `d` tag names the slot the article fills.
export async function loadPartials() {
  try {
    const events = await queryForum({
      kinds: [30023],
      "#t": ["squalk-partial"],
    });
    const next: Partial[] = [];
    for (const e of events) {
      const slot = e.tags.find((t) => t[0] === "d")?.[1];
      if (!slot || !SLOTS.has(slot)) continue;
      next.push({
        id: e.id,
        slot: slot as PartialSlot,
        title: e.tags.find((t) => t[0] === "title")?.[1] ?? slot,
        content: e.content,
        pubkey: e.pubkey,
        createdAt: e.created_at,
      });
    }
    all = next;
  } finally {
    loaded = true;
  }
}
