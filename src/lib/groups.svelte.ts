import { queryForum } from "$lib/relay";

export type GroupSummary = {
  id: string; // NIP-29 group id (the `d` tag) — also the room URL slug
  name: string;
  picture?: string;
  about?: string;
  createdAt: number;
  flags: string[]; // special NIP-29 markers present (private, hidden, closed, restricted)
};

// NIP-29 metadata markers we surface as room tags, in display order.
const SPECIAL_FLAGS = ["private", "hidden", "closed", "restricted"];

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
  try {
    const events = await queryForum({ kinds: [39000] });
    list = events
      .map((e) => {
        const id = e.tags.find((t) => t[0] === "d")?.[1] ?? "";
        return {
          id,
          name: e.tags.find((t) => t[0] === "name")?.[1] ?? id,
          picture: e.tags.find((t) => t[0] === "picture")?.[1],
          about: e.tags.find((t) => t[0] === "about")?.[1],
          createdAt: e.created_at,
          flags: SPECIAL_FLAGS.filter((f) => e.tags.some((t) => t[0] === f)),
        };
      })
      .filter((g) => g.id)
      // Alphabetical for now; a per-group position tag will drive order later.
      .sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    loaded = true;
  }
}
