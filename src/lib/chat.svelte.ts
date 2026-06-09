import type { Event } from "@nostr/tools";
import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";
import { RELAY_URL } from "$lib/config";
import { auth } from "$lib/auth.svelte";
import { queryForum, publishForum, subscribeForum } from "$lib/relay";
import { ingestNostrUser } from "$lib/profiles.svelte";
import { extractMentionPubkeys, buildPTagHints } from "$lib/mentions";
import { convertForumUrls } from "$lib/linkify";

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
let currentGroup: string | null = null;
let chatReq = 0; // supersedes an in-flight load when the room changes
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

export function removeChatMessage(id: string) {
  messages = messages.filter((m) => m.id !== id);
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

// (Re)start chat for a group. Switching rooms tears down the previous live
// subscription, clears its messages, and reloads — a req token discards a load
// that was superseded mid-flight.
export async function startChat(groupId: string) {
  if (!groupId || groupId === currentGroup) return;
  currentGroup = groupId;
  const req = ++chatReq;

  liveSub?.close();
  liveSub = null;
  messages = [];

  try {
    const events = await queryForum({
      kinds: [9],
      "#h": [groupId],
      limit: 100,
    });
    if (req !== chatReq) return;
    for (const ev of events) ingestEvent(ev);
  } catch (e) {
    console.error("[chat] initial load failed", e);
  }

  if (req !== chatReq) return;

  liveSub = subscribeForum(
    {
      kinds: [9],
      "#h": [groupId],
      since: Math.floor(Date.now() / 1000),
    },
    { onevent: (ev) => ingestEvent(ev) },
  );
}

export function stopChat() {
  chatReq++;
  liveSub?.close();
  liveSub = null;
  currentGroup = null;
  messages = [];
}

export async function sendChatMessage(
  content: string,
  replyTo?: { id: string; pubkey: string },
) {
  if (!auth.signer) throw new Error("Not logged in");
  if (!currentGroup) throw new Error("No room selected");
  const ownPubkey = await auth.signer.getPublicKey();

  content = convertForumUrls(content);

  const previousRefs = messages
    .filter((m) => m.pubkey !== ownPubkey)
    .slice(-3)
    .map((m) => m.id.slice(0, 8));

  const notifyPubkeys = new Set<string>();
  for (const pk of extractMentionPubkeys(content)) notifyPubkeys.add(pk);
  if (replyTo && replyTo.pubkey !== ownPubkey)
    notifyPubkeys.add(replyTo.pubkey);
  notifyPubkeys.delete(ownPubkey);

  const hints = await buildPTagHints(notifyPubkeys);

  const tags: string[][] = [["h", currentGroup]];
  if (replyTo) {
    tags.push(["q", replyTo.id, RELAY_URL, replyTo.pubkey]);
  }
  for (const pk of notifyPubkeys) {
    const hint = hints.get(pk);
    tags.push(hint ? ["p", pk, hint] : ["p", pk]);
  }
  if (previousRefs.length > 0) tags.push(["previous", ...previousRefs]);

  const signed = await auth.signer.signEvent({
    kind: 9,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  });

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Relay did not respond in time")), 8000),
  );
  await Promise.race([Promise.all(publishForum(signed)), timeout]);

  ingestEvent(signed);
}
