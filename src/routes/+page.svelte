<script lang="ts">
  import { onMount } from "svelte";
  import {
    threadStore,
    loadThreads,
    type ThreadData,
  } from "$lib/threads.svelte";
  import ThreadItem, {
    type ThreadRow,
    type Author,
  } from "$lib/components/ThreadItem.svelte";
  import type { NostrUser } from "@nostr/gadgets/metadata";

  onMount(loadThreads);

  function relativeTime(ts: number): string {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  function resolveAuthor(
    pubkey: string,
    profiles: Record<string, NostrUser>,
  ): Author {
    const user = profiles[pubkey];
    return {
      pubkey,
      name: user?.shortName ?? pubkey.slice(0, 8),
      picture: user?.metadata.picture,
    };
  }

  function toRow(
    t: ThreadData,
    profiles: Record<string, NostrUser>,
  ): ThreadRow {
    return {
      id: t.id,
      title: t.title,
      author: resolveAuthor(t.authorPubkey, profiles),
      replyCount: t.replyCount,
      repliers: t.replierPubkeys.map((pk) => resolveAuthor(pk, profiles)),
      lastActiveAuthor: resolveAuthor(t.latestPubkey, profiles),
      lastActivity: relativeTime(t.latestAt),
      score: 0,
    };
  }

  const rows = $derived(
    threadStore.threads.map((t) => toRow(t, threadStore.profiles)),
  );
</script>

<svelte:head>
  <title>Discussions</title>
</svelte:head>

<div class="mx-auto max-w-6xl">
  <div class="flex items-center justify-between py-2">
    <h1 class="text-[1.65rem] text-brand">Discussions</h1>
    <button
      class="rounded bg-brand px-6 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
    >
      New Topic
    </button>
  </div>

  <div>
    {#each rows as thread}
      <ThreadItem {thread} />
    {/each}
  </div>
</div>
