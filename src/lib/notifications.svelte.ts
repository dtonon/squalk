import { GROUP_ID, MODE } from "$lib/config";
import { queryForum, subscribeForum } from "$lib/relay";
import { ensureProfile } from "$lib/profiles.svelte";
import {
  fetchNotifications,
  fetchThreadTitles,
  parseNotification,
  type Notification,
  type NotificationPage,
} from "$lib/forum/notifications";

export type { Notification };

const SEEN_KEY = "notifications_seen";
const scope = () => (MODE === "simple" ? GROUP_ID : undefined);

let pubkey = $state<string | null>(null);
let items = $state<Notification[] | null>(null);
let done = $state(true);
let loadingMore = $state(false);
let seenAt = $state(0);
let cursor: number | undefined; // `until` of the next page
let dropped = new Set<string>(); // skipped events, kept out of later pages
let liveSub: { close(): void } | null = null;
let req = 0; // supersedes an in-flight load on login/logout

function readSeen(pk: string): number {
  try {
    return Number(localStorage.getItem(`${SEEN_KEY}_${pk}`)) || 0;
  } catch {
    return 0;
  }
}

export const notificationsStore = {
  get pubkey() {
    return pubkey;
  },
  get items() {
    return items;
  },
  get done() {
    return done;
  },
  get loadingMore() {
    return loadingMore;
  },
  get seenAt() {
    return seenAt;
  },
  get unreadCount() {
    return items?.filter((n) => n.createdAt > seenAt).length ?? 0;
  },
};

function ingest(n: Notification) {
  if (!items || items.some((x) => x.id === n.id)) return;
  items = [n, ...items];
  ensureProfile(n.pubkey);
}

// (Re)start for the logged-in user: one authenticated read of the latest
// replies/mentions, then a live subscription that prepends new ones.
export async function startNotifications(pk: string) {
  if (pk === pubkey) return;
  stopNotifications();
  pubkey = pk;
  seenAt = readSeen(pk);
  const current = ++req;
  const groupId = scope();

  let result: NotificationPage = { items: [], done: true, dropped: [] };
  const skipped = new Set<string>();
  try {
    result = await fetchNotifications(queryForum, pk, { groupId });
    // A first window filtered out entirely: read further back
    for (let i = 0; i < 4 && !result.items.length && !result.done; i++) {
      for (const id of result.dropped) skipped.add(id);
      result = await fetchNotifications(queryForum, pk, {
        groupId,
        until: result.cursor,
        exclude: skipped,
      });
    }
  } catch (e) {
    console.error("[notifications] load failed", e);
  }
  if (current !== req) return;
  items = result.items;
  done = result.done;
  cursor = result.cursor;
  dropped = new Set([...skipped, ...result.dropped]);
  for (const n of result.items) ensureProfile(n.pubkey);

  liveSub = subscribeForum(
    {
      kinds: [1111, 9],
      "#p": [pk],
      ...(groupId ? { "#h": [groupId] } : {}),
      since: Math.floor(Date.now() / 1000),
    },
    {
      onevent: async (ev) => {
        const n = parseNotification(ev, pk);
        if (!n) return;
        try {
          const [readable] = await fetchThreadTitles(queryForum, [n]);
          if (readable && current === req) ingest(readable);
        } catch {
          // Thread unknown: left out like on the initial load
        }
      },
    },
  );
}

export function stopNotifications() {
  req++;
  liveSub?.close();
  liveSub = null;
  pubkey = null;
  items = null;
  done = true;
  loadingMore = false;
  seenAt = 0;
  cursor = undefined;
  dropped = new Set();
}

// Append the next page of older notifications.
export async function loadMoreNotifications() {
  const pk = pubkey;
  const current = req;
  if (!pk || !items || done || loadingMore) return;
  loadingMore = true;
  try {
    const next = await fetchNotifications(queryForum, pk, {
      groupId: scope(),
      until: cursor,
      exclude: new Set([...items.map((n) => n.id), ...dropped]),
    });
    if (current !== req || !items) return;
    items = [...items, ...next.items];
    done = next.done;
    cursor = next.cursor;
    for (const id of next.dropped) dropped.add(id);
    for (const n of next.items) ensureProfile(n.pubkey);
  } catch (e) {
    console.error("[notifications] failed to load more", e);
  } finally {
    if (current === req) loadingMore = false;
  }
}

// Everything loaded so far counts as read.
export function markNotificationsSeen() {
  if (!pubkey) return;
  seenAt = Math.floor(Date.now() / 1000);
  try {
    localStorage.setItem(`${SEEN_KEY}_${pubkey}`, String(seenAt));
  } catch {
    // Private mode: unread state lasts for the session only
  }
}
