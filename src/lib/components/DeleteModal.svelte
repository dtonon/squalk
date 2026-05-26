<script lang="ts">
  import { tick } from "svelte";
  import {
    deleteState,
    cancelDelete,
    confirmDelete,
  } from "$lib/moderation.svelte";

  let reason = $state("");
  let reasonEl = $state<HTMLTextAreaElement | null>(null);

  $effect(() => {
    if (deleteState.open) {
      tick().then(() => reasonEl?.focus());
    } else {
      reason = "";
    }
  });

  function onKeydown(e: KeyboardEvent) {
    if (!deleteState.open) return;
    if (e.key === "Escape") cancelDelete();
  }

  async function onConfirm() {
    await confirmDelete(reason);
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if deleteState.open && deleteState.target}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      aria-label="Close"
      class="absolute inset-0 bg-black/40"
      onclick={cancelDelete}
    ></button>
    <div
      class="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-title"
    >
      <h2 id="delete-title" class="mb-2 text-lg font-semibold text-neutral-900">
        Delete {deleteState.target.label}?
      </h2>
      <p class="mb-4 text-sm text-neutral-600">
        This asks the relay to remove the {deleteState.target.label} for everyone.
        It can't be undone.
      </p>

      {#if deleteState.error}
        <div
          class="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {deleteState.error}
        </div>
      {/if}

      <label for="delete-reason" class="mb-1 block text-sm text-neutral-600"
        >Reason (optional)</label
      >
      <textarea
        id="delete-reason"
        bind:this={reasonEl}
        bind:value={reason}
        disabled={deleteState.busy}
        rows="2"
        placeholder="Recorded with the deletion"
        class="mb-4 w-full resize-none rounded border border-neutral-200 px-3 py-2 text-sm focus:ring-1 focus:ring-brand focus:outline-none disabled:opacity-50"
      ></textarea>

      <div class="flex justify-end gap-2">
        <button
          type="button"
          onclick={cancelDelete}
          disabled={deleteState.busy}
          class="rounded px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onclick={onConfirm}
          disabled={deleteState.busy}
          class="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {deleteState.busy ? "Deleting…" : "Delete"}
        </button>
      </div>
    </div>
  </div>
{/if}
