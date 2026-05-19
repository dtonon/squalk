import { SimplePool } from "@nostr/tools";
import { RELAY_URL } from "$lib/config";

export type GroupSummary = {
  id: string; // NIP-29 group id (the `d` tag) — also the room URL slug
  name: string;
  picture?: string;
  about?: string;
  createdAt: number;
};

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

// Fetch every group the relay hosts. NIP-29 publishes one kind 39000 metadata
// event per group, so an unfiltered query enumerates them all.
export async function loadGroups() {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync([RELAY_URL], { kinds: [39000] });
    list = events
      .map((e) => {
        const id = e.tags.find((t) => t[0] === "d")?.[1] ?? "";
        return {
          id,
          name: e.tags.find((t) => t[0] === "name")?.[1] ?? id,
          picture: e.tags.find((t) => t[0] === "picture")?.[1],
          about: e.tags.find((t) => t[0] === "about")?.[1],
          createdAt: e.created_at,
        };
      })
      .filter((g) => g.id)
      // Alphabetical for now; a per-group position tag will drive order later.
      .sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    loaded = true;
    pool.close([RELAY_URL]);
  }
}
