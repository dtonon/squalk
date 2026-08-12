<script lang="ts">
  import type { SearchState } from "$lib/searchState.svelte";
  import type { SearchResult } from "$lib/search";

  type Props = {
    search: SearchState;
    // Base for the listbox and option element ids (aria-activedescendant)
    idBase: string;
    class?: string;
    onselect: (r: SearchResult) => void;
  };

  let { search, idBase, class: cls = "", onselect }: Props = $props();
</script>

<div id={idBase} role="listbox" aria-label="Search results" class={cls}>
  {#if search.searching}
    <div
      class="flex items-center gap-2 px-4 py-2 text-sm text-neutral-400 dark:text-neutral-500"
      aria-live="polite"
    >
      <span
        class="inline-block h-3 w-3 animate-spin rounded-full border border-neutral-300 border-t-neutral-600 dark:border-neutral-600"
        aria-hidden="true"
      ></span>
      <span>Searching…</span>
    </div>
  {:else if search.results.length === 0}
    <div class="px-4 py-2 text-sm text-neutral-400 dark:text-neutral-500">
      No results
    </div>
  {/if}
  {#snippet marked(text: string)}
    {#each search.highlight(text) as p}
      {#if p.hit}<mark
          class="bg-secondary/40 dark:bg-secondary/30 rounded-sm text-inherit"
          >{p.text}</mark
        >{:else}{p.text}{/if}
    {/each}
  {/snippet}
  {#each search.results as r, i (r.threadId)}
    <a
      id="{idBase}-{i}"
      href={search.threadUrl(r.threadId)}
      role="option"
      aria-selected={i === search.activeIndex}
      class="block rounded px-4 py-2 {i === search.activeIndex
        ? 'bg-neutral-100 dark:bg-neutral-800'
        : ''}"
      onmousedown={(e) => {
        e.preventDefault();
        onselect(r);
      }}
      onmouseenter={() => (search.activeIndex = i)}
    >
      <span
        class="block truncate font-medium text-neutral-800 dark:text-neutral-200"
      >
        {@render marked(r.title)}
        {#if r.matchKind === "reply"}
          <span
            class="ml-1 text-xs font-normal text-neutral-400 dark:text-neutral-500"
            >reply</span
          >
        {/if}
      </span>
      {#if r.snippet}
        <span
          class="block truncate text-sm text-neutral-500 dark:text-neutral-400"
        >
          {@render marked(r.snippet)}
        </span>
      {/if}
    </a>
  {/each}
</div>
