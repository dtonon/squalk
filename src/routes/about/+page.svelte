<script lang="ts">
  import { groupStore } from "$lib/group.svelte";
  import { GROUP_ID } from "$lib/config";

  const name = $derived(groupStore.data?.name ?? GROUP_ID);
  const about = $derived(groupStore.data?.about ?? "");
</script>

<svelte:head>
  <title>About — {name}</title>
  <meta name="description" content={about} />
</svelte:head>

<div class="mx-auto max-w-6xl">
  <h1 class="py-2 text-[1.65rem] text-brand">About {name}</h1>
  {#if about}
    <p class="leading-relaxed whitespace-pre-wrap text-neutral-600">{about}</p>
  {:else}
    <p class="text-neutral-400">No description available.</p>
  {/if}
</div>
