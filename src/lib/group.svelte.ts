import { SimplePool } from "@nostr/tools";
import { RELAY_URL, GROUP_ID } from "$lib/config";

export type GroupMetadata = {
  name: string;
  picture?: string;
  about?: string;
  isPrivate: boolean;
  isClosed: boolean;
  admins: string[];
};

let group = $state<GroupMetadata | null>(null);
let loaded = $state(false);

export const groupStore = {
  get data() {
    return group;
  },
  get loaded() {
    return loaded;
  },
};

export async function loadGroup() {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync([RELAY_URL], {
      kinds: [39000, 39001],
      "#d": [GROUP_ID],
    });
    const event = events.find((e) => e.kind === 39000);
    if (!event) return;
    // Admins live in the NIP-29 kind 39001 event as `p` tags.
    const adminsEvent = events.find((e) => e.kind === 39001);
    const admins =
      adminsEvent?.tags.filter((t) => t[0] === "p").map((t) => t[1]) ?? [];
    group = {
      name: event.tags.find((t) => t[0] === "name")?.[1] ?? GROUP_ID,
      picture: event.tags.find((t) => t[0] === "picture")?.[1],
      about: event.tags.find((t) => t[0] === "about")?.[1],
      isPrivate: event.tags.some((t) => t[0] === "private"),
      isClosed: event.tags.some((t) => t[0] === "closed"),
      admins,
    };
  } finally {
    loaded = true;
    pool.close([RELAY_URL]);
  }
}
