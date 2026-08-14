import { loadNostrUser, type NostrUser } from "$lib/gadgets";
import { ensureForumRelay } from "$lib/relay";
import { ingestNostrUser } from "$lib/profiles.svelte";
import { relayQuery } from "$lib/forum/query";
import {
  fetchThreadPage,
  type SortMode,
  type ThreadData,
} from "$lib/forum/threads";

export type { SortMode, ThreadData };

let threads = $state<ThreadData[]>([]);
let profiles = $state<Record<string, NostrUser>>({});
let exhausted = $state(false);
let loading = $state(false);
let loadingMore = $state(false);

let sortMode: SortMode = "active";
let cursor: number | null = null; // sort-key value of the last loaded thread
let snapshotAt = 0; // upper time bound, frozen at initial load
let reqId = 0; // supersedes in-flight loads when the sort/group changes

export const threadStore = {
  get threads() {
    return threads;
  },
  get profiles() {
    return profiles;
  },
  get exhausted() {
    return exhausted;
  },
  get loading() {
    return loading;
  },
  get loadingMore() {
    return loadingMore;
  },
};

async function loadProfile(pubkey: string) {
  if (profiles[pubkey]) return;
  const user = await loadNostrUser(pubkey);
  profiles[pubkey] = user;
  ingestNostrUser(user);
}

async function runLoad(append: boolean, groupId: string) {
  const id = ++reqId;
  if (append) loadingMore = true;
  else loading = true;
  // Paged loads drive their own subscriptions on the shared connection
  const q = relayQuery(await ensureForumRelay());
  try {
    const page = await fetchThreadPage(q, groupId, {
      sort: sortMode,
      until: append ? (cursor ?? snapshotAt) : snapshotAt,
      snapshotAt,
      exclude: new Set(threads.map((t) => t.id)),
    });
    if (id !== reqId) return; // Superseded by a newer load — discard results
    threads = append ? [...threads, ...page.threads] : page.threads;
    cursor = page.nextCursor ?? cursor;
    exhausted = page.done || page.threads.length === 0;
    for (const t of page.threads) {
      loadProfile(t.authorPubkey);
      loadProfile(t.latestPubkey);
      for (const p of t.replierPubkeys) loadProfile(p);
    }
  } finally {
    if (id === reqId) {
      if (append) loadingMore = false;
      else loading = false;
    }
  }
}

export async function loadThreads(groupId: string, sort: SortMode = "active") {
  sortMode = sort;
  threads = [];
  cursor = null;
  exhausted = false;
  snapshotAt = Math.floor(Date.now() / 1000);
  await runLoad(false, groupId);
}

export async function loadMore(groupId: string) {
  if (loading || loadingMore || exhausted) return;
  await runLoad(true, groupId);
}
