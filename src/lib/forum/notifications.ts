import type { Event } from "@nostr/tools/core";
import { extractMentionPubkeys } from "$lib/mentions";
import { tag, type Query } from "./query";

export type NotificationKind =
  | "quote" // reply quoting one of the user's posts
  | "mention" // mentioned in a discussion reply
  | "reply-op" // reply to a discussion the user started
  | "reply" // reply in a discussion the user took part in, p-tag only
  | "chat-reply" // chat reply to the user's message
  | "chat-mention"; // mentioned in chat

// Everything but plain thread activity is addressed to the user. Not applied
// yet: a future setting will let users leave plain activity out of the badge.
export function isDirect(kind: NotificationKind): boolean {
  return kind !== "reply";
}

export type Notification = {
  id: string;
  kind: NotificationKind;
  pubkey: string; // author
  createdAt: number;
  content: string;
  groupId: string;
  threadId?: string; // discussion replies only
  title?: string; // thread title, filled by fetchThreadTitles
};

export const NOTIFICATIONS_PAGE = 20;
const CURSOR_HEADROOM = 10; // boundary events re-read at the inclusive cursor

export type NotificationPage = {
  items: Notification[];
  done: boolean; // no older notifications left
  cursor?: number; // `until` for the next page
  dropped: string[]; // events skipped, to exclude from the next page
};

// Classify an event that p-tags the user. Own events, events outside a group
// and anything that is neither a discussion reply nor a chat message yield null.
export function parseNotification(e: Event, me: string): Notification | null {
  if (e.pubkey === me) return null;
  const groupId = tag(e, "h");
  if (!groupId) return null;
  const mentioned = extractMentionPubkeys(e.content).includes(me);
  const base = {
    id: e.id,
    pubkey: e.pubkey,
    createdAt: e.created_at,
    content: e.content,
    groupId,
  };
  if (e.kind === 1111) {
    const threadId = tag(e, "E");
    if (!threadId) return null;
    // Comments on anything but a forum thread can't be opened here
    const rootKind = tag(e, "K");
    if (rootKind && rootKind !== "11") return null;
    const quoted = e.tags.some((t) => t[0] === "q" && t[3] === me);
    const kind: NotificationKind = quoted
      ? "quote"
      : mentioned
        ? "mention"
        : tag(e, "P") === me
          ? "reply-op"
          : "reply";
    return { ...base, kind, threadId };
  }
  if (e.kind === 9) {
    const q = e.tags.find((t) => t[0] === "q");
    return { ...base, kind: q?.[3] === me ? "chat-reply" : "chat-mention" };
  }
  return null;
}

// Fill thread titles for discussion replies, in place, and return the items
// whose thread is readable: a reply to a root the relay doesn't return as a
// kind 11 would open on "unavailable".
export async function fetchThreadTitles(
  q: Query,
  items: Notification[],
): Promise<Notification[]> {
  const ids = [
    ...new Set(items.flatMap((n) => (n.threadId ? [n.threadId] : []))),
  ];
  if (ids.length === 0) return items;
  const roots = await q({ kinds: [11], ids });
  const titles = new Map(
    roots.map((e) => [e.id, tag(e, "title") ?? "(untitled)"]),
  );
  return items.filter((n) => {
    if (!n.threadId) return true;
    const title = titles.get(n.threadId);
    if (title === undefined) return false;
    n.title = title;
    return true;
  });
}

// One page of replies and mentions addressed to the user, newest first,
// older than the cursor. Without `groupId` every group the relay serves the
// caller counts.
export async function fetchNotifications(
  q: Query,
  me: string,
  req: { groupId?: string; until?: number; exclude?: Set<string> } = {},
): Promise<NotificationPage> {
  const n = NOTIFICATIONS_PAGE;
  const exclude = req.exclude ?? new Set<string>();
  const events = await q({
    kinds: [1111, 9],
    "#p": [me],
    ...(req.groupId ? { "#h": [req.groupId] } : {}),
    ...(req.until ? { until: req.until } : {}),
    limit: n + CURSOR_HEADROOM,
  });
  const unseen = events.filter((e) => !exclude.has(e.id));
  const parsed = unseen
    .map((e) => parseNotification(e, me))
    .filter((x): x is Notification => x !== null);
  const fresh = (await fetchThreadTitles(q, parsed)).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  const items = fresh.slice(0, n);
  const kept = new Set(fresh.map((x) => x.id));
  const dropped = unseen.filter((e) => !kept.has(e.id)).map((e) => e.id);
  // Finished only when everything fresh fits the page and the relay had
  // nothing beyond the requested window
  const done = fresh.length <= n && events.length < n + CURSOR_HEADROOM;
  // A window where everything was dropped still moves the cursor back
  const cursor = items.length
    ? items[items.length - 1].createdAt
    : events.length
      ? Math.min(...events.map((e) => e.created_at))
      : req.until;
  return { items, done, cursor, dropped };
}
