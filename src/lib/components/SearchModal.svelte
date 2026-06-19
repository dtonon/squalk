<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import { searchThreads, type SearchResult } from "$lib/search";
  import { searchModal, openSearch, closeSearch } from "$lib/searchModal.svelte";

  let query = $state("");
  let results = $state<SearchResult[]>([]);
  let resultsQuery = $state(""); // The query that produced the current results
  let searching = $state(false);
  let activeIndex = $state(-1);
  let inputEl = $state<HTMLInputElement | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;

  const active = $derived(resultsQuery.trim().length >= 2);

  // Focus (and select, so a stale query is typed over) when the modal opens
  $effect(() => {
    if (searchModal.open)
      tick().then(() => {
        inputEl?.focus();
        inputEl?.select();
      });
  });

  function schedule() {
    const q = query.trim();
    if (timer) clearTimeout(timer);
    activeIndex = -1;
    if (q.length < 2) {
      seq++; // Supersede any in-flight query
      results = [];
      resultsQuery = "";
      searching = false;
      return;
    }
    searching = true;
    timer = setTimeout(async () => {
      const id = ++seq;
      try {
        const r = await searchThreads(q);
        if (id !== seq) return;
        results = r;
        resultsQuery = q;
      } finally {
        if (id === seq) searching = false;
      }
    }, 300);
  }

  function select(r: SearchResult) {
    closeSearch();
    goto(`/thread/${r.threadId}`);
  }

  function onInputKeydown(e: KeyboardEvent) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % results.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + results.length) % results.length;
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      select(results[activeIndex]);
    }
  }

  const terms = $derived(resultsQuery.split(/\s+/).filter((t) => t.length >= 2));

  function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Split into alternating plain/matched segments for <mark> rendering
  function highlight(text: string): { text: string; hit: boolean }[] {
    if (!text || terms.length === 0) return [{ text, hit: false }];
    const alts = terms.map(escapeRe).join("|");
    const exact = new RegExp(`^(${alts})$`, "i");
    return text
      .split(new RegExp(`(${alts})`, "gi"))
      .filter((s) => s !== "")
      .map((s) => ({ text: s, hit: exact.test(s) }));
  }

  // Global "/" opens the search from any page, unless typing somewhere else
  function onWindowKeydown(e: KeyboardEvent) {
    if (searchModal.open) {
      if (e.key === "Escape") closeSearch();
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
      class="absolute inset-0 bg-black/40"
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
          bind:value={query}
          type="search"
          placeholder="Search"
          role="combobox"
          aria-expanded={active}
          aria-controls={active ? "search-results" : undefined}
          aria-activedescendant={activeIndex >= 0
            ? `search-result-${activeIndex}`
            : undefined}
          aria-label="Search discussions"
          autocomplete="off"
          oninput={schedule}
          onkeydown={onInputKeydown}
          class="focus:ring-accent focus:dark:ring-accent w-full rounded border border-neutral-200 bg-neutral-100 py-2 pr-14 pl-11 text-neutral-800 placeholder-neutral-400 focus:bg-neutral-50 focus:ring-1 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:placeholder-neutral-500 focus:dark:bg-neutral-950"
        />
        <kbd
          class="pointer-events-none absolute top-1/2 right-3 flex h-6 -translate-y-1/2 items-center justify-center rounded-md bg-neutral-200 px-1.5 font-sans text-xs text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
          aria-hidden="true">esc</kbd
        >
      </div>

      {#if active || searching}
        <div
          id="search-results"
          role="listbox"
          aria-label="Search results"
          class="mt-3 max-h-[50vh] overflow-auto border-t border-neutral-100 pt-2 dark:border-neutral-800"
        >
          {#if searching}
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
          {:else if results.length === 0}
            <div
              class="px-4 py-2 text-sm text-neutral-400 dark:text-neutral-500"
            >
              No results
            </div>
          {/if}
          {#snippet marked(text: string)}
            {#each highlight(text) as p}
              {#if p.hit}<mark
                  class="bg-secondary/40 dark:bg-secondary/30 rounded-sm text-inherit"
                  >{p.text}</mark
                >{:else}{p.text}{/if}
            {/each}
          {/snippet}
          {#each results as r, i (r.threadId)}
            <a
              id="search-result-{i}"
              href="/thread/{r.threadId}"
              role="option"
              aria-selected={i === activeIndex}
              class="block rounded px-4 py-2 {i === activeIndex
                ? 'bg-neutral-100 dark:bg-neutral-800'
                : ''}"
              onmousedown={(e) => {
                e.preventDefault();
                select(r);
              }}
              onmouseenter={() => (activeIndex = i)}
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
      {/if}
    </div>
  </div>
{/if}
