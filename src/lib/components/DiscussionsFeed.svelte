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
  import Meta from "$lib/components/Meta.svelte";
  import { groupStore } from "$lib/group.svelte";
  import { groupsStore } from "$lib/groups.svelte";
  import { MODE } from "$lib/config";
  import type { NostrUser } from "@nostr/gadgets/metadata";
  import { auth, openLogin } from "$lib/auth.svelte";
  import { openDraft } from "$lib/draft.svelte";
  import { getGroupFlags } from "$lib/group.svelte";
  import {
    membershipOf,
    ensureMembershipChecked,
    withJoin,
    joinState,
  } from "$lib/join.svelte";
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

  const about = $derived(
    MODE === "full"
      ? (groupsStore.list.find((g) => g.id === groupId)?.about ?? "")
      : (groupStore.data?.about ?? ""),
  );

  const flags = $derived(getGroupFlags(groupId));
  const member = $derived(membershipOf(groupId));

  // The relay requires membership to post to any group, so resolve it on entry
  // for every room. Depends on auth.user so a silent session restore re-runs it.
  $effect(() => {
    auth.user;
    ensureMembershipChecked(groupId);
  });

  const showPrivateGate = $derived(!!flags?.isPrivate && member === "guest");
  const checkingAccess = $derived(!!flags?.isPrivate && member === "unknown");
  // Posting needs membership regardless of flags. Only gate a confirmed guest;
  // while membership is still resolving the click awaits the check, so a member
  // never flashes "Join to post".
  const joinToPost = $derived(!!auth.user && member === "guest");

  // Re-runs on mount and whenever the group or effective sort changes.
  $effect(() => {
    loadThreads(groupId, sort);
  });

  async function onNewTopic() {
    if (!auth.user) {
      openLogin(onNewTopic);
      return;
    }
    await withJoin(groupId, openDraft);
  }

  function onPrivateJoin() {
    if (!auth.user) {
      openLogin();
      return;
    }
    withJoin(groupId, () => loadThreads(groupId, sort));
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

  const empty = $derived(
    rows.length === 0 && !threadStore.loading && threadStore.exhausted,
  );
</script>

<Meta {title} description={about} />

<div class="mx-auto max-w-6xl">
  <div class="flex flex-wrap items-center justify-between gap-2 py-2">
    <h1 class="text-accent text-[1.65rem] leading-7">{title}</h1>
    {#if !showPrivateGate && !checkingAccess && !empty}
      <div class="flex items-center gap-2">
        <button
          onclick={onNewTopic}
          disabled={joinState.busy}
          class="bg-accent hover:bg-accent-hover rounded px-4 py-1.5 font-medium text-white disabled:opacity-50 md:px-6 md:text-sm"
        >
          {joinState.busy
            ? "Joining…"
            : joinToPost
              ? "Join to post"
              : "New discussion"}
        </button>
        <SortToggle {sort} />
      </div>
    {/if}
  </div>

  {#if checkingAccess}
    <p class="py-12 text-center text-sm text-neutral-400 dark:text-neutral-500">
      Checking access…
    </p>
  {:else if showPrivateGate}
    <div
      class="mt-6 rounded-lg border border-neutral-200 px-6 py-10 text-center dark:border-neutral-700"
    >
      <h2 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        This room is private
      </h2>
      <p
        class="mx-auto mt-2 max-w-md text-sm text-neutral-600 dark:text-neutral-400"
      >
        Only members can read its discussions. Join to request access.
      </p>
      <button
        onclick={onPrivateJoin}
        disabled={joinState.busy}
        class="bg-accent hover:bg-accent-hover mt-5 rounded px-6 py-1.5 font-medium text-white disabled:opacity-50"
      >
        {joinState.busy
          ? "Joining…"
          : auth.user
            ? "Request to join"
            : "Log in to join"}
      </button>
    </div>
  {:else if empty}
    <div class="flex flex-col items-center gap-6 py-24 text-center">
      <p class="text-2xl text-neutral-500 md:text-3xl dark:text-neutral-400">
        This room is still empty
      </p>
      <button
        onclick={onNewTopic}
        disabled={joinState.busy}
        class="bg-accent hover:bg-accent-hover rounded px-6 py-2 font-medium text-white disabled:opacity-50"
      >
        {joinState.busy ? "Joining…" : "Be the first one to open a discussion"}
      </button>
    </div>
  {:else}
    <div>
      {#each rows as thread}
        <ThreadItem {thread} />
      {/each}
    </div>

    {#if threadStore.loading && rows.length === 0}
      <p
        class="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500"
      >
        Loading discussions…
      </p>
    {:else if !threadStore.exhausted}
      <div class="flex justify-center py-6">
        <button
          onclick={() => loadMore(groupId)}
          disabled={threadStore.loadingMore}
          aria-busy={threadStore.loadingMore}
          class="rounded border border-neutral-200 px-6 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {threadStore.loadingMore ? "Loading…" : "Show more"}
        </button>
      </div>
    {:else if rows.length > 0}
      <p
        class="py-6 text-center text-sm text-neutral-400 dark:text-neutral-500"
      >
        No more discussions
      </p>
    {/if}
  {/if}
</div>
