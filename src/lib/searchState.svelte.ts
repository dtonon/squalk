import { searchThreads, type SearchResult } from "$lib/search";
import { findPhraseSpans, findMatchSpans } from "$lib/textMatch";

// Debounced-search state machine shared by the inline (homepage) and modal
// search shells, so behavior lives in one place and the shells only differ
// in chrome and positioning.
export function createSearchState() {
  let query = $state("");
  let results = $state<SearchResult[]>([]);
  let resultsQuery = $state(""); // The query that produced the current results
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

  // Split into alternating plain/matched segments for <mark> rendering.
  // When the text contains the whole query as a contiguous phrase, only the
  // phrase is marked; otherwise contiguous runs (as single blocks) and
  // single words are marked as a fallback, to show why the text matched.
  function highlight(text: string): { text: string; hit: boolean }[] {
    if (!text) return [{ text, hit: false }];
    const phrase = findPhraseSpans(text, resultsQuery);
    const spans =
      phrase.length > 0 ? phrase : findMatchSpans(text, resultsQuery);
    if (spans.length === 0) return [{ text, hit: false }];
    const out: { text: string; hit: boolean }[] = [];
    let pos = 0;
    for (const s of spans) {
      if (s.start > pos)
        out.push({ text: text.slice(pos, s.start), hit: false });
      out.push({ text: text.slice(s.start, s.end), hit: true });
      pos = s.end;
    }
    if (pos < text.length) out.push({ text: text.slice(pos), hit: false });
    return out;
  }

  // Arrow/Enter handling; returns true when the event was consumed
  function navigate(
    e: KeyboardEvent,
    pick: (r: SearchResult) => void,
  ): boolean {
    if (results.length === 0) return false;
    if (e.key === "ArrowDown") {
      activeIndex = (activeIndex + 1) % results.length;
    } else if (e.key === "ArrowUp") {
      activeIndex = (activeIndex - 1 + results.length) % results.length;
    } else if (e.key === "Enter" && activeIndex >= 0) {
      pick(results[activeIndex]);
    } else {
      return false;
    }
    e.preventDefault();
    return true;
  }

  return {
    get query() {
      return query;
    },
    set query(v: string) {
      query = v;
    },
    get results() {
      return results;
    },
    get searching() {
      return searching;
    },
    get activeIndex() {
      return activeIndex;
    },
    set activeIndex(v: number) {
      activeIndex = v;
    },
    // True once a query has produced (or is about to produce) results
    get active() {
      return resultsQuery.trim().length >= 2;
    },
    get resultsQuery() {
      return resultsQuery;
    },
    // Thread link carrying the query, so the page can highlight the terms
    threadUrl(threadId: string) {
      return `/thread/${threadId}?q=${encodeURIComponent(resultsQuery.trim())}`;
    },
    schedule,
    highlight,
    navigate,
  };
}

export type SearchState = ReturnType<typeof createSearchState>;
