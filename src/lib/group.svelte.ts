import { SimplePool } from "@nostr/tools";
import { RELAY_URL, GROUP_ID } from "$lib/config";

export type GroupMetadata = {
  name: string;
  picture?: string;
  about?: string;
  isPrivate: boolean;
  isClosed: boolean;
};

let group = $state<GroupMetadata | null>(null);

export const groupStore = {
  get data() {
    return group;
  },
};

export async function loadGroup() {
  const pool = new SimplePool();
  try {
    const events = await pool.querySync([RELAY_URL], {
      kinds: [39000],
      "#d": [GROUP_ID],
      limit: 1,
    });
    const event = events[0];
    if (!event) return;
    group = {
      name: event.tags.find((t) => t[0] === "name")?.[1] ?? GROUP_ID,
      picture: event.tags.find((t) => t[0] === "picture")?.[1],
      about: event.tags.find((t) => t[0] === "about")?.[1],
      isPrivate: event.tags.some((t) => t[0] === "private"),
      isClosed: event.tags.some((t) => t[0] === "closed"),
    };
  } finally {
    pool.close([RELAY_URL]);
  }
}
