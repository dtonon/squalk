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
};

// Classify an event that p-tags the user. Own events and anything that is
// neither a discussion reply nor a chat message yield null.
export function parseNotification(e: Event, me: string): Notification | null {
  if (e.pubkey === me) return null;
  const mentioned = extractMentionPubkeys(e.content).includes(me);
  const base = {
    id: e.id,
    pubkey: e.pubkey,
    createdAt: e.created_at,
    content: e.content,
    groupId: tag(e, "h") ?? "",
  };
  if (e.kind === 1111) {
    const threadId = tag(e, "E");
    if (!threadId) return null;
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

// Fill thread titles for discussion replies, in place.
export async function fetchThreadTitles(
  q: Query,
  items: Notification[],
): Promise<void> {
  const ids = [
    ...new Set(items.flatMap((n) => (n.threadId ? [n.threadId] : []))),
  ];
  if (ids.length === 0) return;
  const roots = await q({ kinds: [11], ids });
  const titles = new Map(
    roots.map((e) => [e.id, tag(e, "title") ?? "(untitled)"]),
  );
  for (const n of items) {
    if (n.threadId) n.title = titles.get(n.threadId) ?? "";
  }
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
  const fresh = events
    .filter((e) => !exclude.has(e.id))
    .map((e) => parseNotification(e, me))
    .filter((x): x is Notification => x !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
  const items = fresh.slice(0, n);
  // Finished only when everything fresh fits the page and the relay had
  // nothing beyond the requested window
  const done = fresh.length <= n && events.length < n + CURSOR_HEADROOM;
  await fetchThreadTitles(q, items);
  return { items, done };
}
