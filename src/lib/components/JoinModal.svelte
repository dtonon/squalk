<script lang="ts">
  import { joinState, closeJoinModal, submitJoin } from "$lib/join.svelte";
  import { tick } from "svelte";

  let code = $state("");
  let codeInput = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (joinState.modalOpen && joinState.needsCode) {
      tick().then(() => codeInput?.focus());
    }
    if (!joinState.modalOpen) code = "";
  });

  async function onSubmit() {
    await submitJoin(code.trim() || undefined);
  }

  function onClose() {
    closeJoinModal();
  }

  function onKeydown(e: KeyboardEvent) {
    if (!joinState.modalOpen) return;
    if (e.key === "Escape") onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if joinState.modalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      aria-label="Close"
      class="absolute inset-0 bg-black/40"
      onclick={onClose}
    ></button>
    <div
      class="relative w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900"
      role="dialog"
      aria-modal="true"
      aria-labelledby="join-title"
    >
      <button
        type="button"
        onclick={onClose}
        aria-label="Close"
        disabled={joinState.busy}
        class="absolute top-3 right-3 text-2xl leading-none text-neutral-400 hover:text-neutral-700 disabled:opacity-50 dark:text-neutral-500 dark:hover:text-neutral-300"
      >
        ×
      </button>

      <h2
        id="join-title"
        class="mb-2 text-lg font-semibold text-neutral-900 dark:text-neutral-100"
      >
        Join this group
      </h2>
      <p class="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        {#if joinState.needsCode}
          Join this group to participate. If you have an invite code, enter it
          below — otherwise just send the request.
        {:else}
          Join this group to participate. Your request is sent to the relay and,
          where needed, approved by an admin.
        {/if}
      </p>

      {#if joinState.modalError}
        <div
          class="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {joinState.modalError}
        </div>
      {/if}

      {#if joinState.needsCode}
        <label for="join-code-input" class="sr-only">Invite code</label>
        <input
          id="join-code-input"
          bind:this={codeInput}
          type="text"
          placeholder="Invite code (optional)"
          bind:value={code}
          disabled={joinState.busy}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          onkeydown={(e) => e.key === "Enter" && onSubmit()}
          class="focus:ring-accent mb-3 w-full rounded border border-neutral-200 px-3 py-2 text-sm focus:ring-1 focus:outline-none disabled:opacity-50 dark:border-neutral-700"
        />
      {/if}

      <div class="flex justify-end gap-2">
        <button
          type="button"
          onclick={onClose}
          disabled={joinState.busy}
          class="rounded px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Close
        </button>
        <button
          type="button"
          onclick={onSubmit}
          disabled={joinState.busy}
          class="bg-accent hover:bg-accent-hover rounded px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {joinState.busy
            ? "Joining…"
            : joinState.needsCode
              ? "Request access"
              : "Join"}
        </button>
      </div>
    </div>
  </div>
{/if}
