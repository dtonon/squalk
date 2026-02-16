<script lang="ts">
  import { threads, rooms } from "$lib/mock";
  import ThreadItem from "$lib/components/ThreadItem.svelte";
  import { page } from "$app/state";

  const slug = $derived(page.params.slug);
  const room = $derived(rooms.find((r) => r.slug === slug));
</script>

<svelte:head>
  <title>{room?.name ?? "Room"}</title>
</svelte:head>

<div class="mx-auto max-w-6xl">
  <div class="flex items-center justify-between pb-2">
    <h1 class="text-[1.65rem] text-brand leading-7">{room?.name ?? slug}</h1>
    <button
      class="rounded bg-brand px-6 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
    >
      New Topic
    </button>
  </div>

  <div>
    {#each threads as thread}
      <ThreadItem {thread} />
    {/each}
  </div>
</div>
