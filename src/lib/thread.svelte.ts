import { loadNostrUser, type NostrUser } from "$lib/gadgets";
import { page } from "$app/state";
import { RELAY_URL, GROUP_ID } from "$lib/config";
import { queryForum, publishForum } from "$lib/relay";
import { threads as mockThreads } from "$lib/mock";
import { auth } from "$lib/auth.svelte";
import { ingestNostrUser } from "$lib/profiles.svelte";
import {
  extractMentionPubkeys,
  extractQuotedEvents,
  buildPTagHints,
} from "$lib/mentions";
import { convertForumUrls } from "$lib/linkify";
import {
  fetchThread,
  type PostData,
  type ThreadDetail,
} from "$lib/forum/thread";

export type { PostData };

const isNostrId = (id: string) => /^[0-9a-f]{64}$/.test(id);

let detail = $state<ThreadDetail | null>(null);
let profiles = $state<Record<string, NostrUser>>({});
// "notfound" means the relay returned nothing — either no such thread or it sits
// in a private group the current (non-member) user can't read.
let status = $state<"loading" | "ready" | "notfound">("loading");

// Until the live fetch lands, the server snapshot (if any) stands in. Its
// profiles stay as a base layer: the live ones arrive one by one.
export const threadDetailStore = {
  get detail() {
    return detail ?? page.data.thread ?? null;
  },
  get profiles() {
    const base = page.data.profiles;
    return base ? { ...base, ...profiles } : profiles;
  },
  get status() {
    return status === "loading" && page.data.thread ? "ready" : status;
  },
};

async function loadProfile(pubkey: string) {
  if (profiles[pubkey]) return;
  const user = await loadNostrUser(pubkey);
  profiles[pubkey] = user;
  ingestNostrUser(user);
}

function loadMockThread(id: string) {
  const t = mockThreads.find((t) => t.id === id);
  if (!t) return;
  const toUnix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);
  detail = {
    id: t.id,
    title: t.title,
    labels: t.tags.map((tag) => tag.label),
    groupId: GROUP_ID,
    op: {
      id: t.op.id,
      pubkey: t.op.author.pubkey,
      createdAt: toUnix(t.op.createdAt),
      content: t.op.content,
    },
    replies: (t.op.replies ?? []).map((r) => ({
      id: r.id,
      pubkey: r.author.pubkey,
      createdAt: toUnix(r.createdAt),
      content: r.content,
    })),
  };
  const allAuthors = [
    t.op.author,
    ...(t.op.replies ?? []).map((r) => r.author),
  ];
  for (const a of allAuthors) {
    profiles[a.pubkey] = {
      pubkey: a.pubkey,
      npub: a.pubkey,
      shortName: a.name,
      image: a.picture,
      metadata: { name: a.name, picture: a.picture },
      lastUpdated: 0,
    } as NostrUser;
  }
}

export async function loadThread(id: string) {
  detail = null;
  profiles = {};
  status = "loading";

  if (!isNostrId(id)) {
    await Promise.resolve();
    loadMockThread(id);
    status = detail ? "ready" : "notfound";
    return;
  }

  const next = await fetchThread(queryForum, id, GROUP_ID);
  if (!next) {
    status = "notfound";
    return;
  }
  detail = next;
  [next.op.pubkey, ...next.replies.map((r) => r.pubkey)].forEach(loadProfile);
  status = "ready";
}

export function removeReply(id: string) {
  if (!detail) return;
  detail = { ...detail, replies: detail.replies.filter((r) => r.id !== id) };
}

export async function sendReply(content: string, ownPubkey: string) {
  if (!detail) throw new Error("No thread loaded");
  if (!auth.signer) throw new Error("Not logged in");

  content = convertForumUrls(content);

  // Use last 3 events not authored by us as previous refs (NIP-29)
  const previousRefs = [...detail.replies, detail.op]
    .filter((p) => p.pubkey !== ownPubkey)
    .slice(-3)
    .map((p) => p.id.slice(0, 8));

  // NIP-7D mandates flat-against-root, so parent === root for every reply.
  // Build the notify set: thread participants + mentions + quoted authors, minus self.
  const quoted = extractQuotedEvents(content);
  const notifyPubkeys = new Set<string>();
  notifyPubkeys.add(detail.op.pubkey);
  for (const r of detail.replies) notifyPubkeys.add(r.pubkey);
  for (const pk of extractMentionPubkeys(content)) notifyPubkeys.add(pk);
  for (const q of quoted) if (q.author) notifyPubkeys.add(q.author);
  notifyPubkeys.delete(ownPubkey);

  // Best-effort relay hints — cached calls return instantly, others race a timeout.
  const hints = await buildPTagHints([...notifyPubkeys, detail.op.pubkey]);

  const opHint = hints.get(detail.op.pubkey) ?? RELAY_URL;

  const tags: string[][] = [
    ["h", detail.groupId],
    ["E", detail.id, opHint, detail.op.pubkey],
    ["K", "11"],
    ["P", detail.op.pubkey, opHint],
    ["e", detail.id, opHint, detail.op.pubkey],
    ["k", "11"],
  ];
  for (const pk of notifyPubkeys) {
    const hint = hints.get(pk);
    tags.push(hint ? ["p", pk, hint] : ["p", pk]);
  }
  for (const q of quoted) {
    const tag: string[] = ["q", q.id, q.relay ?? RELAY_URL];
    if (q.author) tag.push(q.author);
    tags.push(tag);
  }
  if (previousRefs.length > 0) tags.push(["previous", ...previousRefs]);

  console.log("[reply] signing event…");
  const signed = await auth.signer.signEvent({
    kind: 1111,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content,
  });
  console.log("[reply] event signed:", signed.id);

  console.log("[reply] publishing…");
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("Relay did not respond in time")), 8000),
  );
  await Promise.race([Promise.all(publishForum(signed)), timeout]);
  console.log("[reply] published");

  const newReply: PostData = {
    id: signed.id,
    pubkey: signed.pubkey,
    createdAt: signed.created_at,
    content: signed.content,
  };
  detail = { ...detail, replies: [...detail.replies, newReply] };
  loadProfile(signed.pubkey);
}
