import { GROUP_ID, MODE } from "$lib/config";
import { queryForum, subscribeForum } from "$lib/relay";
import { ensureProfile } from "$lib/profiles.svelte";
import {
  fetchNotifications,
  fetchThreadTitles,
  parseNotification,
  type Notification,
} from "$lib/forum/notifications";

export type { Notification };

const SEEN_KEY = "notifications_seen";

let pubkey = $state<string | null>(null);
let items = $state<Notification[] | null>(null);
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
  const scope = MODE === "simple" ? GROUP_ID : undefined;

  let result: Notification[] = [];
  try {
    result = await fetchNotifications(queryForum, pk, scope);
  } catch (e) {
    console.error("[notifications] load failed", e);
  }
  if (current !== req) return;
  items = result;
  for (const n of result) ensureProfile(n.pubkey);

  liveSub = subscribeForum(
    {
      kinds: [1111, 9],
      "#p": [pk],
      ...(scope ? { "#h": [scope] } : {}),
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
  seenAt = 0;
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
