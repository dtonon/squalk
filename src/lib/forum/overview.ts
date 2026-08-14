import { tag, type Query } from "./query";

export type RoomActivity = {
  latestAt: number;
  latestPubkey: string;
};

export type RecentThread = {
  id: string;
  title: string;
  groupId: string;
  authorPubkey: string;
  createdAt: number;
};

export type Overview = {
  activity: Record<string, RoomActivity>;
  admins: Record<string, string>; // room id -> first admin pubkey
  recent: RecentThread[];
};

const RECENT_LIMIT = 20;

// Landing data across rooms: each room's last activity and first admin (for
// the room cards) and the most recent threads overall (for the side panel).
// The group relay truncates multi-value "#h" filters, so rooms are queried
// one by one and merged.
export async function fetchOverview(
  q: Query,
  roomIds: string[],
): Promise<Overview> {
  const latest = await Promise.all(
    roomIds.map((id) => q({ kinds: [11, 1111], "#h": [id], limit: 1 })),
  );
  const activity: Record<string, RoomActivity> = {};
  roomIds.forEach((id, i) => {
    const e = latest[i][0];
    if (e) activity[id] = { latestAt: e.created_at, latestPubkey: e.pubkey };
  });

  const adminEvents = await Promise.all(
    roomIds.map((id) => q({ kinds: [39001], "#d": [id] })),
  );
  const admins: Record<string, string> = {};
  roomIds.forEach((id, i) => {
    const pk = adminEvents[i][0] ? tag(adminEvents[i][0], "p") : undefined;
    if (pk) admins[id] = pk;
  });

  const perRoom = await Promise.all(
    roomIds.map((id) => q({ kinds: [11], "#h": [id], limit: RECENT_LIMIT })),
  );
  const threads = perRoom.flat().sort((a, b) => b.created_at - a.created_at);
  const recent = threads.slice(0, RECENT_LIMIT).map((e) => ({
    id: e.id,
    title: tag(e, "title") ?? "(untitled)",
    groupId: tag(e, "h") ?? "",
    authorPubkey: e.pubkey,
    createdAt: e.created_at,
  }));

  return { activity, admins, recent };
}

export function overviewPubkeys(o: Overview): string[] {
  return [
    ...new Set([
      ...Object.values(o.activity).map((a) => a.latestPubkey),
      ...Object.values(o.admins),
      ...o.recent.map((t) => t.authorPubkey),
    ]),
  ];
}
