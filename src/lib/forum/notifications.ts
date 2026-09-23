import type { Event } from "@nostr/tools/core";
import { extractMentionPubkeys } from "$lib/mentions";
import { tag, type Query } from "./query";

export type NotificationKind =
  | "reply-op" // reply to a discussion the user started
  | "reply" // reply in a discussion the user took part in
  | "mention" // mentioned in a discussion reply
  | "chat-reply" // chat reply to the user's message
  | "chat-mention"; // mentioned in chat

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

export const NOTIFICATIONS_LIMIT = 50;

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
    const kind: NotificationKind = mentioned
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

// Latest replies and mentions addressed to the user, newest first. Without
// `groupId` every group the relay serves the caller counts.
export async function fetchNotifications(
  q: Query,
  me: string,
  groupId?: string,
): Promise<Notification[]> {
  const events = await q({
    kinds: [1111, 9],
    "#p": [me],
    ...(groupId ? { "#h": [groupId] } : {}),
    limit: NOTIFICATIONS_LIMIT,
  });
  const items = events
    .map((e) => parseNotification(e, me))
    .filter((n): n is Notification => n !== null)
    .sort((a, b) => b.createdAt - a.createdAt);
  await fetchThreadTitles(q, items);
  return items;
}
