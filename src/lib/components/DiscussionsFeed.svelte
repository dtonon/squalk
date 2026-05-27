<script lang="ts">
  import {
    threadStore,
    loadThreads,
    loadMore,
    type ThreadData,
    type SortMode,
  } from "$lib/threads.svelte";
  import ThreadItem, {
    type ThreadRow,
    type Author,
  } from "$lib/components/ThreadItem.svelte";
  import SortToggle from "$lib/components/SortToggle.svelte";
  import type { NostrUser } from "@nostr/gadgets/metadata";
  import { auth, openLogin } from "$lib/auth.svelte";
  import { openDraft } from "$lib/draft.svelte";
  import { sortPref } from "$lib/sort.svelte";
  import { page } from "$app/state";

  type Props = {
    groupId: string;
    title: string;
  };

  let { groupId, title }: Props = $props();

  function parseSort(v: string | null): SortMode | null {
    return v === "new" ? "new" : v === "active" ? "active" : null;
  }

  // URL param is the explicit override; otherwise fall back to the saved
  // preference so the sort survives Home/room navigation.
  const urlSort = $derived(parseSort(page.url.searchParams.get("sort")));
  const sort = $derived<SortMode>(urlSort ?? sortPref.value);

  // Remember any explicit choice that arrives via the URL.
  $effect(() => {
    if (urlSort) sortPref.value = urlSort;
  });

  // Re-runs on mount and whenever the group or effective sort changes.
  $effect(() => {
    loadThreads(groupId, sort);
  });

  function onNewTopic() {
    if (!auth.user) {
      openLogin();
      return;
    }
    openDraft();
  }

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
      labels: t.labels,
      author: resolveAuthor(t.authorPubkey, profiles),
      replyCount: t.replyCount,
      repliers: t.replierPubkeys.map((pk) => resolveAuthor(pk, profiles)),
      lastActiveAuthor: resolveAuthor(t.latestPubkey, profiles),
      lastActivity: relativeTime(t.latestAt),
    };
  }

  const rows = $derived(
    threadStore.threads.map((t) => toRow(t, threadStore.profiles)),
  );
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<div class="mx-auto max-w-6xl">
  <div class="flex flex-wrap items-center justify-between gap-2 py-2">
    <h1 class="text-brand text-[1.65rem] leading-7">{title}</h1>
    <div class="flex items-center gap-2">
      <button
        onclick={onNewTopic}
        class="bg-brand hover:bg-brand-hover rounded px-4 py-1.5 font-medium text-white md:px-6 md:text-sm"
      >
        New discussion
      </button>
      <SortToggle {sort} />
    </div>
  </div>

  <div>
    {#each rows as thread}
      <ThreadItem {thread} />
    {/each}
  </div>

  {#if threadStore.loading && rows.length === 0}
    <p class="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">
      Loading discussions…
    </p>
  {:else if !threadStore.exhausted}
    <div class="flex justify-center py-6">
      <button
        onclick={() => loadMore(groupId)}
        disabled={threadStore.loadingMore}
        aria-busy={threadStore.loadingMore}
        class="rounded border border-neutral-200 dark:border-neutral-700 px-6 py-1.5 text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-50"
      >
        {threadStore.loadingMore ? "Loading…" : "Show more"}
      </button>
    </div>
  {:else if rows.length > 0}
    <p class="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">No more discussions</p>
  {/if}
</div>
