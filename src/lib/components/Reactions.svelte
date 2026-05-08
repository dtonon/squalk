<script lang="ts">
  import type { Reaction } from "$lib/mock";

  type Props = {
    reactions: Reaction[];
    zaps: number;
  };

  let { reactions, zaps }: Props = $props();
</script>

<div class="flex flex-wrap items-center gap-1.5">
  {#each reactions as r}
    <button
      class="flex items-center gap-1 rounded-full border border-neutral-200 px-2 py-0.5 text-xs hover:bg-neutral-50"
    >
      <span>{r.emoji}</span>
      <span class="text-neutral-600">{r.count}</span>
    </button>
  {/each}
  {#if zaps > 0}
    <button
      class="flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs hover:bg-amber-100"
    >
      <span>⚡</span>
      <span class="text-amber-700"
        >{zaps >= 1000 ? (zaps / 1000).toFixed(1) + "k" : zaps}</span
      >
    </button>
  {/if}
</div>
