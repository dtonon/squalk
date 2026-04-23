<script lang="ts">
  import { tick } from "svelte";
  import * as nip19 from "@nostr/tools/nip19";
  import { loadRelayList } from "@nostr/gadgets/lists";
  import { uploadImage } from "$lib/blossom";
  import { BLOSSOM_URL } from "$lib/config";
  import PostContent from "$lib/components/PostContent.svelte";
  import {
    profileStore,
    searchLocalProfiles,
    searchRemoteProfiles,
    type ProfileEntry,
  } from "$lib/profiles.svelte";

  type Props = {
    value: string;
    uploading?: boolean;
    disabled?: boolean;
    rows?: number;
    placeholder?: string;
    minHeightClass?: string;
    contextPubkeys?: string[];
  };

  let {
    value = $bindable(),
    uploading = $bindable(false),
    disabled = false,
    rows = 4,
    placeholder = "",
    minHeightClass = "",
    contextPubkeys = [],
  }: Props = $props();

  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);
  let uploadError = $state<string | null>(null);
  let previewing = $state(false);

  // Mention autocomplete state
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
  let listboxEl = $state<HTMLDivElement | null>(null);

  const contextSet = $derived(new Set(contextPubkeys));

  const mentionLocalResults = $derived.by(() => {
    if (mentionQuery === null) return [];
    if (mentionQuery === "") {
      // Bare "@": only thread participants we know about, no global cache spill.
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

  export function focus() {
    textareaEl?.focus();
  }

  function togglePreview() {
    previewing = !previewing;
  }

  function onUploadClick() {
    fileInputEl?.click();
  }

  async function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploadError = null;
    uploading = true;
    try {
      const blob = await uploadImage(file);
      const ta = textareaEl;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const sep = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
        const insertion = sep + blob.url + "\n";
        value = before + insertion + after;
        await tick();
        ta.focus();
        const pos = (before + insertion).length;
        ta.setSelectionRange(pos, pos);
      } else {
        value = (value ? value + "\n" : "") + blob.url + "\n";
      }
    } catch (err) {
      uploadError = err instanceof Error ? err.message : "Upload failed";
    } finally {
      uploading = false;
      input.value = "";
    }
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

    // Fetch the user's kind:10002 to embed write-relay hints in the nprofile.
    // Cached by gadgets, so repeat selections are instant.
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
    if (mentionQuery === null) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeMention();
      return;
    }
    if (mergedResults.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      userMovedCursor = true;
      mentionIndex = (safeMentionIndex + 1) % mergedResults.length;
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      userMovedCursor = true;
      mentionIndex =
        (safeMentionIndex - 1 + mergedResults.length) % mergedResults.length;
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const entry = mergedResults[safeMentionIndex];
      if (entry) selectMention(entry);
    }
  }

  function onTextareaClickOrSelect() {
    updateMentionFromTextarea();
  }

  function onTextareaBlur() {
    setTimeout(() => closeMention(), 120);
  }

  // Keep the highlighted (most-relevant) item visible as results change.
  $effect(() => {
    if (!listboxEl) return;
    const idx = safeMentionIndex;
    const items = listboxEl.querySelectorAll<HTMLElement>('[role="option"]');
    items[idx]?.scrollIntoView({ block: "nearest" });
  });
</script>

<div class="flex flex-col {previewing ? 'flex-1 min-h-0' : ''}">
  {#if previewing}
    <div
      class="w-full rounded-t border border-gray-200 px-3 py-2 overflow-auto flex-1 min-h-0 max-h-[70vh] {minHeightClass}"
      aria-label="Preview"
    >
      {#if value.trim()}
        <PostContent content={value} />
      {:else}
        <p class="text-gray-400 italic">Nothing to preview</p>
      {/if}
    </div>
  {:else}
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
        onblur={onTextareaBlur}
        aria-autocomplete="list"
        aria-controls={mentionOpen ? "mention-listbox" : undefined}
        class="w-full rounded-t border border-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50 resize-none {minHeightClass}"
      ></textarea>
      {#if mentionOpen}
        <div
          id="mention-listbox"
          bind:this={listboxEl}
          class="absolute z-30 left-0 right-0 max-h-72 overflow-auto rounded border border-gray-200 bg-white shadow-lg"
          class:bottom-full={anchorAbove}
          class:mb-1={anchorAbove}
          class:top-full={!anchorAbove}
          class:mt-1={!anchorAbove}
        >
          {#if mentionQuery === ""}
            <div
              class="px-3 py-1.5 text-xs text-gray-400"
              class:border-b={mergedResults.length > 0}
              class:border-gray-100={mergedResults.length > 0}
            >
              Type to search
            </div>
          {:else if remoteSearching && mergedResults.length > 0}
            <div
              class="px-3 py-1.5 text-xs text-gray-400 flex items-center gap-2 border-b border-gray-100"
              aria-live="polite"
            >
              <span
                class="h-3 w-3 inline-block rounded-full border border-gray-300 border-t-gray-600 animate-spin"
                aria-hidden="true"
              ></span>
              <span>Searching…</span>
            </div>
          {/if}
          {#if mergedResults.length === 0 && mentionQuery !== ""}
            <div class="px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
              {#if remoteSearching}
                <span
                  class="h-3 w-3 inline-block rounded-full border border-gray-300 border-t-gray-600 animate-spin"
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
                  class="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm"
                  class:bg-gray-100={i === safeMentionIndex}
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
                      class="h-6 w-6 rounded-full object-cover flex-shrink-0"
                    />
                  {:else}
                    <span
                      class="h-6 w-6 rounded-full bg-gray-200 flex items-center justify-center text-xs text-gray-500 flex-shrink-0"
                      aria-hidden="true"
                    >
                      {profileLabel(entry)[0]?.toUpperCase() ?? "?"}
                    </span>
                  {/if}
                  <span class="font-medium text-gray-700 truncate">
                    {profileLabel(entry)}
                  </span>
                  {#if profileSubLabel(entry)}
                    <span class="text-xs text-gray-400 truncate">
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
  {/if}
  <div
    class="flex flex-shrink-0 items-center gap-4 rounded-b border border-t-0 border-gray-200 bg-gray-50 px-3 py-2 text-sm"
  >
    <button
      type="button"
      onclick={onUploadClick}
      disabled={uploading || disabled || previewing || !BLOSSOM_URL}
      title={!BLOSSOM_URL ? "Blossom server not configured" : ""}
      class="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      {uploading ? "Uploading…" : "Upload image"}
    </button>
    {#if uploadError}
      <span class="text-xs text-red-600">{uploadError}</span>
    {/if}
    <button
      type="button"
      onclick={togglePreview}
      disabled={disabled || uploading}
      aria-pressed={previewing}
      class="ml-auto inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      {previewing ? "Edit" : "Preview"}
    </button>
  </div>
  <input
    type="file"
    bind:this={fileInputEl}
    onchange={onFileChange}
    accept="image/*"
    class="hidden"
  />
</div>
