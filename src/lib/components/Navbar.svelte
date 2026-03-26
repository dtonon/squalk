<script lang="ts">
  import { groupStore } from "$lib/group.svelte";
  import { GROUP_ID } from "$lib/config";

  const name = $derived(groupStore.data?.name ?? GROUP_ID);
</script>

<header class="flex h-16 shrink-0 items-center justify-between px-8">
  <div class="flex items-center gap-2">
    {#if groupStore.data?.picture}
      <img
        src={groupStore.data.picture}
        alt=""
        class="h-9 w-9 rounded-full object-cover"
      />
    {:else}
      <div
        class="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 font-bold text-white"
      >
        {name[0].toUpperCase()}
      </div>
    {/if}
    <span class="text-[1.7rem] font-medium text-gray-900">{name}</span>
  </div>
  <button class="text-sm text-gray-500 hover:text-gray-900"
    >Create your own community</button
  >
</header>
