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

  let result: NotificationPage = { items: [], done: true };
  try {
    result = await fetchNotifications(queryForum, pk, { groupId });
  } catch (e) {
    console.error("[notifications] load failed", e);
  }
  if (current !== req) return;
  items = result.items;
  done = result.done;
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
        if (n.threadId) {
          try {
            await fetchThreadTitles(queryForum, [n]);
          } catch {
            // Shown without a title
          }
        }
        if (current === req) ingest(n);
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
}

// Append the next page of older notifications.
export async function loadMoreNotifications() {
  const pk = pubkey;
  const current = req;
  if (!pk || !items || done || loadingMore) return;
  loadingMore = true;
  const oldest = items[items.length - 1];
  try {
    const next = await fetchNotifications(queryForum, pk, {
      groupId: scope(),
      until: oldest?.createdAt,
      exclude: new Set(items.map((n) => n.id)),
    });
    if (current !== req || !items) return;
    items = [...items, ...next.items];
    done = next.done;
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
