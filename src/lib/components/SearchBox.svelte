<script lang="ts">
  import { goto } from "$app/navigation";
  import { searchThreads, type SearchResult } from "$lib/search";

  let query = $state("");
  let results = $state<SearchResult[]>([]);
  let resultsQuery = $state(""); // The query that produced the current results
  let open = $state(false);
  let searching = $state(false);
  let activeIndex = $state(-1);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let seq = 0;

  function schedule() {
    const q = query.trim();
    if (timer) clearTimeout(timer);
    activeIndex = -1;
    if (q.length < 2) {
      seq++; // Supersede any in-flight query
      open = false;
      results = [];
      searching = false;
      return;
    }
    open = true;
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

  function close() {
    open = false;
    activeIndex = -1;
  }

  function select(r: SearchResult) {
    close();
    goto(`/thread/${r.threadId}`);
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (!open || results.length === 0) return;
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

  const terms = $derived(
    resultsQuery.split(/\s+/).filter((t) => t.length >= 2),
  );

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

  function onFocus() {
    if (query.trim().length >= 2) open = true;
  }

  function onBlur() {
    // Delay so a mousedown on a result still lands
    setTimeout(() => close(), 120);
  }
</script>

<div class="relative">
  <div class="relative">
    <input
      bind:value={query}
      type="search"
      placeholder="Search"
      role="combobox"
      aria-expanded={open}
      aria-controls={open ? "search-results" : undefined}
      aria-activedescendant={activeIndex >= 0
        ? `search-result-${activeIndex}`
        : undefined}
      aria-label="Search discussions"
      autocomplete="off"
      oninput={schedule}
      onkeydown={onKeydown}
      onfocus={onFocus}
      onblur={onBlur}
      class="w-full rounded-lg bg-neutral-100 py-2.5 pr-11 pl-4 text-neutral-800 placeholder-neutral-400 focus:ring-2 focus:ring-neutral-300 focus:outline-none dark:bg-neutral-800 dark:text-neutral-200 dark:placeholder-neutral-500 dark:focus:ring-neutral-600"
    />
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="pointer-events-none absolute top-1/2 right-4 h-5 w-5 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
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
  </div>

  {#if open}
    <div
      id="search-results"
      role="listbox"
      aria-label="Search results"
      class="absolute right-0 left-0 z-30 mt-2 max-h-96 overflow-auto rounded-lg border border-neutral-200 bg-white py-2 shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
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
        <div class="px-4 py-2 text-sm text-neutral-400 dark:text-neutral-500">
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
          class="block px-4 py-2 {i === activeIndex
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
