import { SimplePool, type Event } from "@nostr/tools";
import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";
import { RELAY_URL, GROUP_ID } from "$lib/config";
import { auth } from "$lib/auth.svelte";
import { ingestNostrUser } from "$lib/profiles.svelte";

export type ChatMessageData = {
  id: string;
  pubkey: string;
  createdAt: number;
  content: string;
  replyToId?: string;
  replyToPubkey?: string;
};

let messages = $state<ChatMessageData[]>([]);
let profiles = $state<Record<string, NostrUser>>({});
let started = false;
let livePool: SimplePool | null = null;
let liveSub: { close(): void } | null = null;

export const chatStore = {
  get messages() {
    return messages;
  },
  get profiles() {
    return profiles;
  },
};

export function getChatMessage(id: string): ChatMessageData | undefined {
  return messages.find((m) => m.id === id);
}

async function loadProfile(pubkey: string) {
  if (profiles[pubkey]) return;
  try {
    const user = await loadNostrUser(pubkey);
    profiles = { ...profiles, [pubkey]: user };
    ingestNostrUser(user);
  } catch (e) {
    console.error("[chat] profile load failed", pubkey, e);
  }
}

function eventToMessage(ev: Event): ChatMessageData {
  const qTag = ev.tags.find((t) => t[0] === "q");
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    createdAt: ev.created_at,
    content: ev.content,
    replyToId: qTag?.[1],
    replyToPubkey: qTag?.[3],
  };
}

function ingestEvent(ev: Event) {
  if (messages.some((m) => m.id === ev.id)) return;
  const m = eventToMessage(ev);
  let idx = messages.length;
  while (idx > 0 && messages[idx - 1].createdAt > m.createdAt) idx--;
  messages = [...messages.slice(0, idx), m, ...messages.slice(idx)];
  loadProfile(ev.pubkey);
}

export async function startChat() {
  if (started) return;
  started = true;

  const pool = new SimplePool();
  try {
    const events = await pool.querySync([RELAY_URL], {
      kinds: [9],
      "#h": [GROUP_ID],
      limit: 100,
    });
    for (const ev of events) ingestEvent(ev);
  } catch (e) {
    console.error("[chat] initial load failed", e);
  } finally {
    pool.close([RELAY_URL]);
  }

  livePool = new SimplePool();
  liveSub = livePool.subscribeMany(
    [RELAY_URL],
    {
      kinds: [9],
      "#h": [GROUP_ID],
      since: Math.floor(Date.now() / 1000),
    },
    { onevent: (ev) => ingestEvent(ev) },
  );
}

export function stopChat() {
  liveSub?.close();
  livePool?.close([RELAY_URL]);
  liveSub = null;
  livePool = null;
  started = false;
}

export async function sendChatMessage(
  content: string,
  replyTo?: { id: string; pubkey: string },
) {
  if (!auth.signer) throw new Error("Not logged in");
  const ownPubkey = await auth.signer.getPublicKey();

  const previousRefs = messages
    .filter((m) => m.pubkey !== ownPubkey)
    .slice(-3)
    .map((m) => m.id.slice(0, 8));

  const tags: string[][] = [["h", GROUP_ID]];
  if (replyTo) {
    tags.push(["q", replyTo.id, RELAY_URL, replyTo.pubkey]);
    if (replyTo.pubkey !== ownPubkey) tags.push(["p", replyTo.pubkey]);
  }
  if (previousRefs.length > 0) tags.push(["previous", ...previousRefs]);

  const signed = await auth.signer.signEvent({
    kind: 9,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  });

  const pool = new SimplePool();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Relay did not respond in time")),
        8000,
      ),
    );
    await Promise.race([
      Promise.all(pool.publish([RELAY_URL], signed)),
      timeout,
    ]);
  } finally {
    pool.destroy();
  }

  ingestEvent(signed);
}
