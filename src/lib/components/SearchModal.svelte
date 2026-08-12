<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import type { SearchResult } from "$lib/search";
  import { createSearchState } from "$lib/searchState.svelte";
  import { searchModal, openSearch, closeSearch } from "$lib/searchModal.svelte";
  import SearchResults from "$lib/components/SearchResults.svelte";

  const search = createSearchState();

  let inputEl = $state<HTMLInputElement | null>(null);

  // Focus (and select, so a stale query is typed over) when the modal opens
  $effect(() => {
    if (searchModal.open)
      tick().then(() => {
        inputEl?.focus();
        inputEl?.select();
      });
  });

  function select(r: SearchResult) {
    closeSearch();
    goto(search.threadUrl(r.threadId));
  }

  // Global "/" opens the search from any page, unless typing somewhere else
  function onWindowKeydown(e: KeyboardEvent) {
    if (searchModal.open) {
      if (e.key === "Escape") {
        closeSearch();
        return;
      }
      // Typing fast right after "/" can outrun the async focus; route the
      // keystroke into the input so no leading characters get lost
      if (
        e.key.length === 1 &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        document.activeElement !== inputEl
      )
        inputEl?.focus();
      return;
    }
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement | null;
    if (
      t &&
      (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)
    )
      return;
    e.preventDefault();
    openSearch();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if searchModal.open}
  <div class="fixed inset-0 z-50 flex flex-col items-center px-4 pt-[12vh]">
    <button
      type="button"
      aria-label="Close search"
      class="absolute inset-0 bg-black/40 dark:bg-black/65"
      onclick={closeSearch}
    ></button>
    <div
      class="relative w-full max-w-xl rounded-lg bg-white p-3 shadow-xl dark:bg-neutral-900"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
    >
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
          bind:this={inputEl}
          bind:value={search.query}
          type="search"
          placeholder="Search"
          role="combobox"
          aria-expanded={search.active}
          aria-controls={search.active ? "search-results-modal" : undefined}
          aria-activedescendant={search.activeIndex >= 0
            ? `search-results-modal-${search.activeIndex}`
            : undefined}
          aria-label="Search discussions"
          autocomplete="off"
          oninput={search.schedule}
          onkeydown={(e) => search.navigate(e, select)}
          class="focus:ring-accent focus:dark:ring-accent w-full rounded border border-neutral-200 bg-neutral-100 py-2 pr-14 pl-11 text-neutral-800 placeholder-neutral-400 focus:bg-neutral-50 focus:ring-1 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500 focus:dark:bg-neutral-950"
        />
        <kbd
          class="pointer-events-none absolute top-1/2 right-3 flex h-6 -translate-y-1/2 items-center justify-center rounded-md bg-neutral-200 px-1.5 font-sans text-xs text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
          aria-hidden="true">esc</kbd
        >
      </div>

      {#if search.active || search.searching}
        <SearchResults
          {search}
          idBase="search-results-modal"
          class="mt-3 max-h-[50vh] overflow-auto border-t border-neutral-100 pt-2 dark:border-neutral-800"
          onselect={select}
        />
      {/if}
    </div>
  </div>
{/if}
