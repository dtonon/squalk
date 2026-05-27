<script lang="ts">
  import { tick } from "svelte";
  import * as nip19 from "@nostr/tools/nip19";
  import { loadRelayList } from "@nostr/gadgets/lists";
  import {
    profileStore,
    searchLocalProfiles,
    searchRemoteProfiles,
    type ProfileEntry,
  } from "$lib/profiles.svelte";

  type Props = {
    value: string;
    disabled?: boolean;
    rows?: number;
    placeholder?: string;
    contextPubkeys?: string[];
    textareaClass?: string;
    onkeydown?: (e: KeyboardEvent) => void;
    onfocus?: () => void;
    onblur?: () => void;
  };

  let {
    value = $bindable(),
    disabled = false,
    rows = 4,
    placeholder = "",
    contextPubkeys = [],
    textareaClass = "",
    onkeydown,
    onfocus,
    onblur,
  }: Props = $props();

  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let listboxEl = $state<HTMLDivElement | null>(null);

  let mentionQuery = $state<string | null>(null);
  let mentionStart = $state(0);
  let mentionEnd = $state(0);
  let mentionRemoteResults = $state<ProfileEntry[]>([]);
  let mentionIndex = $state(0);
  let userMovedCursor = $state(false);
  let anchorAbove = $state(false);
  let remoteSearching = $state(false);
  let remoteSearchTimer: ReturnType<typeof setTimeout> | null = null;
  let remoteSearchAbort: AbortController | null = null;

  const contextSet = $derived(new Set(contextPubkeys));

  const mentionLocalResults = $derived.by(() => {
    if (mentionQuery === null) return [];
    if (mentionQuery === "") {
      const out: ProfileEntry[] = [];
      for (const pk of contextSet) {
        const p = profileStore.profiles.get(pk);
        if (p) out.push(p);
      }
      return out
        .sort((a, b) =>
          (a.name ?? a.displayName ?? "").localeCompare(
            b.name ?? b.displayName ?? "",
          ),
        )
        .slice(0, 8);
    }
    return searchLocalProfiles(mentionQuery, {
      contextPubkeys: contextSet,
      limit: 8,
    });
  });

  // Most-relevant first internally, reversed for display so the best match
  // sits at the bottom (closest to the textarea when the dropdown opens above).
  const mergedResults = $derived.by(() => {
    const seen = new Set<string>();
    const out: ProfileEntry[] = [];
    for (const p of mentionLocalResults) {
      if (seen.has(p.pubkey)) continue;
      seen.add(p.pubkey);
      out.push(p);
    }
    for (const p of mentionRemoteResults) {
      if (seen.has(p.pubkey)) continue;
      seen.add(p.pubkey);
      out.push(p);
    }
    return out.slice(0, 8).reverse();
  });

  const mentionOpen = $derived(mentionQuery !== null);

  const safeMentionIndex = $derived.by(() => {
    if (mergedResults.length === 0) return 0;
    if (!userMovedCursor) return mergedResults.length - 1;
    return Math.min(mentionIndex, mergedResults.length - 1);
  });

  export function focus(opts: { caretAtEnd?: boolean } = {}) {
    const ta = textareaEl;
    if (!ta) return;
    ta.focus();
    if (opts.caretAtEnd) {
      const pos = ta.value.length;
      ta.setSelectionRange(pos, pos);
    }
  }

  export function getTextarea(): HTMLTextAreaElement | null {
    return textareaEl;
  }

  // Warm the kind:10002 cache for thread participants so relay hints are
  // ready by publish time. Best-effort, dedup across focus events.
  const prefetched = new Set<string>();
  function onTextareaFocus() {
    for (const pk of contextPubkeys) {
      if (prefetched.has(pk)) continue;
      prefetched.add(pk);
      loadRelayList(pk).catch(() => {});
    }
    onfocus?.();
  }

  function detectMentionContext(text: string, cursor: number) {
    const before = text.slice(0, cursor);
    const m = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (!m) return null;
    const query = m[1];
    return {
      query,
      start: cursor - query.length - 1,
      end: cursor,
    };
  }

  function scheduleRemoteSearch(query: string, localCount: number) {
    if (remoteSearchTimer) clearTimeout(remoteSearchTimer);
    remoteSearchAbort?.abort();
    if (!query || query.length < 1 || localCount >= 8) {
      mentionRemoteResults = [];
      remoteSearching = false;
      return;
    }
    remoteSearching = true;
    remoteSearchTimer = setTimeout(async () => {
      const abort = new AbortController();
      remoteSearchAbort = abort;
      const captured = query;
      try {
        const results = await searchRemoteProfiles(captured, abort.signal);
        if (abort.signal.aborted) return;
        if (mentionQuery !== captured) return;
        mentionRemoteResults = results;
      } finally {
        if (mentionQuery === captured) remoteSearching = false;
      }
    }, 200);
  }

  function closeMention() {
    mentionQuery = null;
    mentionRemoteResults = [];
    mentionIndex = 0;
    userMovedCursor = false;
    remoteSearching = false;
    if (remoteSearchTimer) clearTimeout(remoteSearchTimer);
    remoteSearchAbort?.abort();
  }

  function updateMentionFromTextarea() {
    const ta = textareaEl;
    if (!ta) {
      closeMention();
      return;
    }
    const ctx = detectMentionContext(ta.value, ta.selectionStart);
    if (!ctx) {
      closeMention();
      return;
    }
    const wasOpen = mentionQuery !== null;
    if (ctx.query !== mentionQuery) {
      mentionIndex = 0;
      userMovedCursor = false;
      mentionRemoteResults = [];
    }
    mentionQuery = ctx.query;
    mentionStart = ctx.start;
    mentionEnd = ctx.end;
    scheduleRemoteSearch(ctx.query, mentionLocalResults.length);
    if (!wasOpen) updateAnchor();
  }

  function updateAnchor() {
    const ta = textareaEl;
    if (!ta) return;
    const rect = ta.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    anchorAbove = spaceBelow < 280 && spaceAbove > spaceBelow;
  }

  async function selectMention(entry: ProfileEntry) {
    const ta = textareaEl;
    if (!ta || mentionQuery === null) return;
    const before = value.slice(0, mentionStart);
    const after = value.slice(mentionEnd);

    let relays: string[] = [];
    try {
      const list = await loadRelayList(entry.pubkey);
      relays = list.items
        .filter((r) => r.write)
        .slice(0, 2)
        .map((r) => r.url);
    } catch {
      // No hints — still a valid nprofile, just less robust for receivers.
    }

    const nprofile = nip19.nprofileEncode({ pubkey: entry.pubkey, relays });
    const insertion = `nostr:${nprofile}`;
    const trailing = after.startsWith(" ") ? "" : " ";
    value = before + insertion + trailing + after;
    closeMention();
    await tick();
    const pos = (before + insertion + trailing).length;
    ta.focus();
    ta.setSelectionRange(pos, pos);
  }

  function profileLabel(p: ProfileEntry): string {
    return p.name || p.displayName || p.nip05 || p.npub.slice(0, 12) + "…";
  }

  function profileSubLabel(p: ProfileEntry): string | null {
    const main = profileLabel(p);
    if (p.nip05 && p.nip05 !== main) return p.nip05;
    if (p.displayName && p.displayName !== main) return p.displayName;
    return null;
  }

  function onTextareaInput() {
    updateMentionFromTextarea();
  }

  function onTextareaKeydown(e: KeyboardEvent) {
    if (mentionQuery !== null) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMention();
        return;
      }
      if (mergedResults.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          userMovedCursor = true;
          mentionIndex = (safeMentionIndex + 1) % mergedResults.length;
          return;
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          userMovedCursor = true;
          mentionIndex =
            (safeMentionIndex - 1 + mergedResults.length) %
            mergedResults.length;
          return;
        } else if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const entry = mergedResults[safeMentionIndex];
          if (entry) selectMention(entry);
          return;
        }
      }
    }
    onkeydown?.(e);
  }

  function onTextareaClickOrSelect() {
    updateMentionFromTextarea();
  }

  function onTextareaBlur() {
    setTimeout(() => closeMention(), 120);
    onblur?.();
  }

  // Keep the highlighted (most-relevant) item visible as results change.
  $effect(() => {
    if (!listboxEl) return;
    const idx = safeMentionIndex;
    const items = listboxEl.querySelectorAll<HTMLElement>('[role="option"]');
    items[idx]?.scrollIntoView({ block: "nearest" });
  });
</script>

<div class="relative">
  <textarea
    bind:this={textareaEl}
    bind:value
    {disabled}
    {rows}
    {placeholder}
    oninput={onTextareaInput}
    onkeydown={onTextareaKeydown}
    onclick={onTextareaClickOrSelect}
    onkeyup={onTextareaClickOrSelect}
    onfocus={onTextareaFocus}
    onblur={onTextareaBlur}
    aria-autocomplete="list"
    aria-controls={mentionOpen ? "mention-listbox" : undefined}
    class={textareaClass}
  ></textarea>
  {#if mentionOpen}
    <div
      id="mention-listbox"
      bind:this={listboxEl}
      class="absolute right-0 left-0 z-30 max-h-72 overflow-auto rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 shadow-lg"
      class:bottom-full={anchorAbove}
      class:mb-1={anchorAbove}
      class:top-full={!anchorAbove}
      class:mt-1={!anchorAbove}
    >
      {#if mentionQuery === ""}
        <div
          class="px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-500"
          class:border-b={mergedResults.length > 0}
          class:border-neutral-100={mergedResults.length > 0}
        >
          Type to search
        </div>
      {:else if remoteSearching && mergedResults.length > 0}
        <div
          class="flex items-center gap-2 border-b border-neutral-100 dark:border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 dark:text-neutral-500"
          aria-live="polite"
        >
          <span
            class="inline-block h-3 w-3 animate-spin rounded-full border border-neutral-300 dark:border-neutral-600 border-t-neutral-600"
            aria-hidden="true"
          ></span>
          <span>Searching…</span>
        </div>
      {/if}
      {#if mergedResults.length === 0 && mentionQuery !== ""}
        <div class="flex items-center gap-2 px-3 py-2 text-xs text-neutral-400 dark:text-neutral-500">
          {#if remoteSearching}
            <span
              class="inline-block h-3 w-3 animate-spin rounded-full border border-neutral-300 dark:border-neutral-600 border-t-neutral-600"
              aria-hidden="true"
            ></span>
            <span>Searching…</span>
          {:else}
            No matches
          {/if}
        </div>
      {:else if mergedResults.length > 0}
        <ul role="listbox">
          {#each mergedResults as entry, i (entry.pubkey)}
            <li
              role="option"
              aria-selected={i === safeMentionIndex}
              class="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm"
              class:bg-neutral-100={i === safeMentionIndex}
              onmousedown={(e) => {
                e.preventDefault();
                selectMention(entry);
              }}
              onmouseenter={() => {
                userMovedCursor = true;
                mentionIndex = i;
              }}
            >
              {#if entry.picture}
                <img
                  src={entry.picture}
                  alt=""
                  class="h-6 w-6 flex-shrink-0 rounded-full object-cover"
                />
              {:else}
                <span
                  class="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-xs text-neutral-500 dark:text-neutral-400"
                  aria-hidden="true"
                >
                  {profileLabel(entry)[0]?.toUpperCase() ?? "?"}
                </span>
              {/if}
              <span class="truncate font-medium text-neutral-700 dark:text-neutral-300">
                {profileLabel(entry)}
              </span>
              {#if profileSubLabel(entry)}
                <span class="truncate text-xs text-neutral-400 dark:text-neutral-500">
                  {profileSubLabel(entry)}
                </span>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</div>
