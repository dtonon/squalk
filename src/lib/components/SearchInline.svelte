<script lang="ts">
  import { goto } from "$app/navigation";
  import type { SearchResult } from "$lib/search";
  import { createSearchState } from "$lib/searchState.svelte";
  import SearchResults from "$lib/components/SearchResults.svelte";

  const search = createSearchState();

  let open = $state(false);

  function onInput() {
    search.schedule();
    open = search.query.trim().length >= 2;
  }

  function select(r: SearchResult) {
    open = false;
    goto(search.threadUrl(r.threadId));
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      open = false;
      return;
    }
    if (!open) return;
    search.navigate(e, select);
  }

  function onFocus() {
    if (search.query.trim().length >= 2) open = true;
  }

  function onBlur() {
    // Delay so a mousedown on a result still lands
    setTimeout(() => (open = false), 120);
  }
</script>

<div class="relative">
  <div class="relative">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
      />
    </svg>
    <input
      bind:value={search.query}
      data-search-inline
      type="search"
      placeholder="Search"
      role="combobox"
      aria-expanded={open}
      aria-controls={open ? "search-results-inline" : undefined}
      aria-activedescendant={search.activeIndex >= 0
        ? `search-results-inline-${search.activeIndex}`
        : undefined}
      aria-label="Search discussions"
      autocomplete="off"
      oninput={onInput}
      onkeydown={onKeydown}
      onfocus={onFocus}
      onblur={onBlur}
      class="focus:ring-accent focus:dark:ring-accent w-full rounded border border-neutral-200 bg-neutral-100 py-2 pr-12 pl-11 text-neutral-800 placeholder-neutral-400 focus:bg-neutral-50 focus:ring-1 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500 focus:dark:bg-neutral-950"
    />
    <kbd
      class="pointer-events-none absolute top-1/2 right-3 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md bg-neutral-200 font-sans text-sm text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
      aria-hidden="true">/</kbd
    >
  </div>

  {#if open}
    <SearchResults
      {search}
      idBase="search-results-inline"
      class="absolute right-0 left-0 z-30 mt-2 max-h-96 overflow-auto rounded-lg border border-neutral-200 bg-white py-2 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
      onselect={select}
    />
  {/if}
</div>
