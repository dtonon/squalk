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
  import { GROUP_ID } from "$lib/config";
  import { sortPref } from "$lib/sort.svelte";
  import { page } from "$app/state";

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

  // Re-runs on mount and whenever the effective sort changes.
  $effect(() => {
    loadThreads(GROUP_ID, sort);
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
  <title>Discussions</title>
</svelte:head>

<div class="mx-auto max-w-6xl">
  <div class="flex flex-wrap items-center justify-between gap-2 py-2">
    <h1 class="text-[1.65rem] text-brand">Discussions</h1>
    <div class="flex items-center gap-2">
      <button
        onclick={onNewTopic}
        class="rounded bg-brand px-4 py-1.5 md:text-sm font-medium text-white hover:bg-brand-hover md:px-6"
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
    <p class="py-6 text-center text-sm text-neutral-400">
      Loading discussions…
    </p>
  {:else if !threadStore.exhausted}
    <div class="flex justify-center py-6">
      <button
        onclick={() => loadMore(GROUP_ID)}
        disabled={threadStore.loadingMore}
        aria-busy={threadStore.loadingMore}
        class="rounded border border-neutral-200 px-6 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
      >
        {threadStore.loadingMore ? "Loading…" : "Show more"}
      </button>
    </div>
  {:else if rows.length > 0}
    <p class="py-6 text-center text-sm text-neutral-400">No more discussions</p>
  {/if}
</div>
