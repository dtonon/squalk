<script lang="ts">
  import { threads, rooms, type Thread } from "$lib/mock";
  import ThreadItem, {
    type ThreadRow,
  } from "$lib/components/ThreadItem.svelte";
  import { page } from "$app/state";
  import { auth, openLogin } from "$lib/auth.svelte";
  import { openDraft } from "$lib/draft.svelte";

  const slug = $derived(page.params.slug);

  function onNewTopic() {
    if (!auth.user) {
      openLogin();
      return;
    }
    openDraft();
  }
  const room = $derived(rooms.find((r) => r.slug === slug));

  function mockToRow(t: Thread): ThreadRow {
    return {
      id: t.id,
      title: t.title,
      author: t.op.author,
      replyCount: t.replyCount,
      repliers: t.participants
        .filter((p) => p.pubkey !== t.op.author.pubkey)
        .slice(0, 4),
      lastActiveAuthor: t.participants[t.participants.length - 1],
      lastActivity: t.lastActivity,
      score: t.op.reactions.reduce((s, r) => s + r.count, 0) + t.op.zaps,
    };
  }

  const rows = $derived(threads.map(mockToRow));
</script>

<svelte:head>
  <title>{room?.name ?? "Room"}</title>
</svelte:head>

<div class="mx-auto max-w-6xl">
  <div class="flex items-center justify-between pb-2">
    <h1 class="text-[1.65rem] text-brand leading-7">{room?.name ?? slug}</h1>
    <button
      onclick={onNewTopic}
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
