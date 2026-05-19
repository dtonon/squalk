<script lang="ts">
  import { groupStore } from "$lib/group.svelte";
  import { GROUP_ID, TITLE } from "$lib/config";

  type Props = { onMenuToggle: () => void };
  let { onMenuToggle }: Props = $props();

  const name = $derived(TITLE || groupStore.data?.name || GROUP_ID);
</script>

<header
  class="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 bg-neutral-100 px-4 md:static md:px-8"
>
  <div class="flex min-w-0 items-center gap-2">
    {#if groupStore.data?.picture}
      <img
        src={groupStore.data.picture}
        alt=""
        class="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    {:else}
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 font-bold text-white"
      >
        {name[0].toUpperCase()}
      </div>
    {/if}
    <span class="truncate text-2xl font-medium text-neutral-900 md:text-[1.7rem]"
      >{name}</span
    >
  </div>
  <button
    type="button"
    onclick={onMenuToggle}
    class="-mr-1 shrink-0 rounded p-1.5 text-neutral-700 hover:bg-neutral-200 md:hidden"
    aria-label="Open menu"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-6 w-6"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
      />
    </svg>
  </button>
</header>
