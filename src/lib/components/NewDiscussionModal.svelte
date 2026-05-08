<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import {
    draftState,
    iconizeDraft,
    discardDraft,
    addLabel,
    removeLabel,
    publishDraft,
  } from "$lib/draft.svelte";
  import { LABELS } from "$lib/config";
  import { groupStore } from "$lib/group.svelte";
  import MessageEditor from "$lib/components/MessageEditor.svelte";

  let labelInput = $state("");
  let labelInputEl = $state<HTMLInputElement | null>(null);
  let suggestOpen = $state(false);
  let titleEl = $state<HTMLInputElement | null>(null);

  const available = $derived(
    LABELS.filter((l) => !draftState.labels.includes(l)),
  );

  const filtered = $derived(
    labelInput.trim()
      ? available.filter((l) =>
          l.toLowerCase().startsWith(labelInput.trim().toLowerCase()),
        )
      : available,
  );

  // First prefix match becomes the inline ghost suggestion
  const suggestion = $derived(
    labelInput.trim() &&
      filtered[0] &&
      filtered[0].toLowerCase() !== labelInput.trim().toLowerCase()
      ? filtered[0]
      : null,
  );

  $effect(() => {
    if (draftState.modalOpen) {
      tick().then(() => titleEl?.focus());
    } else {
      // Modal stays mounted in the layout — reset transient local state so a
      // stale label input doesn't carry over to the next open.
      labelInput = "";
      suggestOpen = false;
    }
  });

  function commitSuggestion() {
    if (suggestion) {
      addLabel(suggestion);
      labelInput = "";
      return true;
    }
    // Exact match (typed full label that exists)
    const exact = available.find(
      (l) => l.toLowerCase() === labelInput.trim().toLowerCase(),
    );
    if (exact) {
      addLabel(exact);
      labelInput = "";
      return true;
    }
    return false;
  }

  function onLabelKeydown(e: KeyboardEvent) {
    if (e.key === "Tab" || e.key === "Enter") {
      if (commitSuggestion()) e.preventDefault();
    } else if (
      e.key === "Backspace" &&
      !labelInput &&
      draftState.labels.length > 0
    ) {
      removeLabel(draftState.labels[draftState.labels.length - 1]);
    } else if (e.key === "Escape") {
      suggestOpen = false;
      labelInputEl?.blur();
    }
  }

  function onSuggestionClick(l: string) {
    addLabel(l);
    labelInput = "";
    labelInputEl?.focus();
  }

  function onLabelFocus() {
    suggestOpen = true;
  }

  function onLabelBlur() {
    // Delay so click on suggestion fires first
    setTimeout(() => {
      suggestOpen = false;
    }, 150);
  }

  async function onPublish() {
    const res = await publishDraft();
    if (res.ok && res.threadId) {
      await goto(`/thread/${res.threadId}`);
    }
  }

  function onDiscard() {
    if (draftState.hasDraft && !confirm("Discard this draft?")) return;
    discardDraft();
  }

  function onKeydown(e: KeyboardEvent) {
    if (!draftState.modalOpen) return;
    if (e.key === "Escape") iconizeDraft();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if draftState.modalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      aria-label="Minimize draft"
      tabindex="-1"
      class="absolute inset-0 bg-black/40"
      onclick={iconizeDraft}
    ></button>
    <div
      class="relative w-full max-w-2xl rounded-lg bg-white p-6 shadow-xl flex flex-col gap-4 max-h-[90vh] overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="newdisc-title"
    >
      <!-- Header -->
      <div class="flex items-start justify-between">
        <div>
          {#if groupStore.data?.name}
            <p class="text-sm text-neutral-700">{groupStore.data.name}</p>
          {/if}
          <h2 id="newdisc-title" class="text-2xl text-brand">New discussion</h2>
        </div>
        <button
          type="button"
          onclick={iconizeDraft}
          aria-label="Minimize draft"
          class="rounded bg-neutral-50 p-1.5 text-neutral-700 hover:bg-neutral-100"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 37 33"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M10.8656 23.2958C11.0971 23.0642 11.4726 23.0642 11.7042 23.2958C11.9358 23.5274 11.9358 23.9029 11.7042 24.1344L11.0124 24.8263C10.7808 25.0579 10.4053 25.0579 10.1737 24.8263C9.9421 24.5947 9.9421 24.2192 10.1737 23.9876L10.8656 23.2958ZM25.9876 8.17369C26.2192 7.9421 26.5947 7.9421 26.8263 8.17369C27.0579 8.40528 27.0579 8.78077 26.8263 9.01235L22.3038 13.5349H25.5033L25.5186 13.5351C25.839 13.5432 26.0963 13.8055 26.0963 14.1279C26.0963 14.4503 25.839 14.7126 25.5186 14.7207L25.5033 14.7209H20.8721C20.5446 14.7209 20.2791 14.4554 20.2791 14.1279V9.49669C20.2791 9.16917 20.5446 8.90367 20.8721 8.90366C21.1996 8.90366 21.4651 9.16917 21.4651 9.49669L21.4651 12.6962L25.9876 8.17369ZM16.7209 23.5033C16.7209 23.8308 16.4554 24.0963 16.1279 24.0963C15.8004 24.0963 15.5349 23.8308 15.5349 23.5033V20.3038L13.7798 22.0589C13.5482 22.2905 13.1727 22.2904 12.9411 22.0589C12.7095 21.8273 12.7095 21.4518 12.9411 21.2202L14.6962 19.4651H11.4967C11.1692 19.4651 10.9037 19.1996 10.9037 18.8721C10.9037 18.5446 11.1692 18.2791 11.4967 18.2791H16.1279C16.4554 18.2791 16.7209 18.5446 16.7209 18.8721V23.5033Z"
              fill="currentColor"
            />
          </svg>
        </button>
      </div>

      <!-- Title -->
      <div>
        <label
          for="newdisc-title-input"
          class="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1"
        >
          Title
        </label>
        <input
          id="newdisc-title-input"
          type="text"
          bind:this={titleEl}
          bind:value={draftState.title}
          disabled={draftState.publishing}
          maxlength="72"
          class="w-full rounded border border-neutral-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
        />
      </div>

      <!-- Labels -->
      {#if LABELS.length > 0}
        <div class="relative">
          <label
            for="newdisc-labels-input"
            class="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-1"
          >
            Labels
          </label>
          <div
            class="flex flex-wrap gap-1.5 items-center rounded border border-neutral-200 px-3 py-1.5 min-h-[2.5rem] focus-within:ring-1 focus-within:ring-brand"
          >
            {#each draftState.labels as l}
              <span
                class="inline-flex items-center gap-1 rounded-lg bg-accent px-2 py-0.5 text-sm text-white"
              >
                {l}
                <button
                  type="button"
                  onclick={() => removeLabel(l)}
                  aria-label="Remove label {l}"
                  class="leading-none text-white/80 hover:text-white">×</button
                >
              </span>
            {/each}
            <div class="relative flex-1 min-w-[6rem]">
              <input
                id="newdisc-labels-input"
                type="text"
                bind:this={labelInputEl}
                bind:value={labelInput}
                onfocus={onLabelFocus}
                onblur={onLabelBlur}
                onkeydown={onLabelKeydown}
                disabled={draftState.publishing}
                autocomplete="off"
                spellcheck="false"
                placeholder={draftState.labels.length === 0
                  ? "Click to choose…"
                  : ""}
                class="relative z-10 w-full border-0 bg-transparent p-0 outline-none focus:ring-0 text-sm py-0.5 disabled:opacity-50"
              />
              {#if suggestion}
                <span
                  class="pointer-events-none absolute inset-0 flex items-center text-sm text-neutral-400"
                  aria-hidden="true"
                >
                  <span class="invisible">{labelInput}</span><span
                    >{suggestion.slice(labelInput.length)}</span
                  >
                </span>
              {/if}
            </div>
          </div>
          {#if suggestOpen && filtered.length > 0}
            <div
              class="absolute left-0 right-0 z-20 mt-1 rounded border border-neutral-200 bg-white shadow-lg p-3 flex flex-wrap gap-1.5"
            >
              {#each filtered as l}
                <button
                  type="button"
                  onmousedown={(e) => e.preventDefault()}
                  onclick={() => onSuggestionClick(l)}
                  class="rounded-lg bg-accent hover:bg-accent-hover px-2.5 py-0.5 text-sm text-white"
                >
                  {l}
                </button>
              {/each}
            </div>
          {/if}
          {#if suggestion}
            <p class="mt-1 text-xs text-neutral-400">
              Press Tab or Enter to add “{suggestion}”
            </p>
          {/if}
        </div>
      {/if}

      <!-- Content -->
      <MessageEditor
        bind:value={draftState.content}
        disabled={draftState.publishing}
        rows={8}
        minHeightClass="min-h-[12rem]"
      />

      {#if draftState.publishError}
        <div
          class="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {draftState.publishError}
        </div>
      {/if}

      <div class="flex items-center justify-between pt-2">
        <button
          type="button"
          onclick={onDiscard}
          disabled={draftState.publishing}
          class="rounded bg-neutral-700 px-5 py-1.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          Discard
        </button>
        <button
          type="button"
          onclick={onPublish}
          disabled={draftState.publishing ||
            !draftState.title.trim() ||
            !draftState.content.trim()}
          class="rounded bg-brand px-5 py-1.5 text-sm font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {draftState.publishing ? "Publishing…" : "Publish discussion"}
        </button>
      </div>
    </div>
  </div>
{/if}
