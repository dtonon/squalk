import type { Event } from "@nostr/tools/core";
import { tag, tags, type Query } from "./query";

export type GroupSummary = {
  id: string; // NIP-29 group id (the `d` tag) — also the room URL slug
  name: string;
  picture?: string;
  about?: string;
  createdAt: number;
  flags: string[]; // special NIP-29 markers present (private, hidden, closed, restricted)
};

export type GroupMetadata = {
  name: string;
  picture?: string;
  about?: string;
  isPrivate: boolean;
  isClosed: boolean;
  isRestricted: boolean;
  isHidden: boolean;
  admins: string[];
};

const SPECIAL_FLAGS = ["private", "hidden", "closed", "restricted"];

function parseSummary(e: Event): GroupSummary {
  const id = tag(e, "d") ?? "";
  return {
    id,
    name: tag(e, "name") ?? id,
    picture: tag(e, "picture"),
    about: tag(e, "about"),
    createdAt: e.created_at,
    flags: SPECIAL_FLAGS.filter((f) => e.tags.some((t) => t[0] === f)),
  };
}

// Every group the relay serves this visitor (kind 39000), oldest first.
export async function fetchGroups(q: Query): Promise<GroupSummary[]> {
  const events = await q({ kinds: [39000] });
  return events
    .map(parseSummary)
    .filter((g) => g.id)
    .sort((a, b) => a.createdAt - b.createdAt);
}

// One group's metadata plus its admins (kinds 39000 + 39001).
export async function fetchGroup(
  q: Query,
  id: string,
): Promise<GroupMetadata | null> {
  const events = await q({ kinds: [39000, 39001], "#d": [id] });
  const event = events.find((e) => e.kind === 39000);
  if (!event) return null;
  const adminsEvent = events.find((e) => e.kind === 39001);
  return {
    name: tag(event, "name") ?? id,
    picture: tag(event, "picture"),
    about: tag(event, "about"),
    isPrivate: event.tags.some((t) => t[0] === "private"),
    isClosed: event.tags.some((t) => t[0] === "closed"),
    isRestricted: event.tags.some((t) => t[0] === "restricted"),
    isHidden: event.tags.some((t) => t[0] === "hidden"),
    admins: adminsEvent ? tags(adminsEvent, "p") : [],
  };
}

// room id -> admin pubkeys (kind 39001 `p` tags) for the given rooms.
export async function fetchRoomAdmins(
  q: Query,
  roomIds: string[],
): Promise<Record<string, string[]>> {
  if (roomIds.length === 0) return {};
  const events = await q({ kinds: [39001], "#d": roomIds });
  const map: Record<string, string[]> = {};
  for (const e of events) {
    const d = tag(e, "d");
    if (d) map[d] = tags(e, "p");
  }
  return map;
}
