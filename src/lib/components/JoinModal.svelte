<script lang="ts">
  import { joinState, closeJoinModal, submitJoinCode } from "$lib/join.svelte";
  import { tick } from "svelte";

  let code = $state("");
  let codeInput = $state<HTMLInputElement | null>(null);
  // Pending approval hides the code field behind a discreet link, so a group
  // that doesn't hand out codes doesn't send people hunting for one.
  let codeRevealed = $state(false);

  const step = $derived(joinState.modalStep);
  const showCode = $derived(
    step === "relay-code" ||
      (step === "group-code" && joinState.modalCodeHinted) ||
      codeRevealed,
  );
  const canOfferCode = $derived(
    step === "pending" || (step === "group-code" && !joinState.modalCodeHinted),
  );

  $effect(() => {
    if (!joinState.modalOpen) {
      code = "";
      codeRevealed = false;
    }
  });

  $effect(() => {
    if (joinState.modalOpen && showCode) {
      tick().then(() => codeInput?.focus());
    }
  });

  async function onSubmit() {
    await submitJoinCode(code.trim() || undefined);
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
        {#if step === "relay-code"}
          Invite code required
        {:else if step === "pending"}
          Request sent
        {:else if step === "error"}
          Could not join
        {:else}
          Join this group
        {/if}
      </h2>
      <p class="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        {#if step === "relay-code"}
          This relay only accepts members. Enter an invite code to join.
        {:else if step === "pending"}
          Your request to join has been sent. An admin needs to approve it
          before you can participate.
        {:else if step === "error"}
          The relay refused the request.
        {:else if joinState.modalCodeHinted}
          This group requires an invite code to join.
        {:else}
          The group refused the join request.
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

      {#if showCode}
        <label for="join-code-input" class="sr-only">
          {step === "relay-code" ? "Relay invite code" : "Group invite code"}
        </label>
        <input
          id="join-code-input"
          bind:this={codeInput}
          type="text"
          placeholder={step === "relay-code"
            ? "Relay invite code"
            : "Group invite code"}
          bind:value={code}
          disabled={joinState.busy}
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          onkeydown={(e) => e.key === "Enter" && onSubmit()}
          class="focus:ring-accent mb-3 w-full rounded border border-neutral-200 px-3 py-2 text-sm focus:ring-1 focus:outline-none disabled:opacity-50 dark:border-neutral-700"
        />
      {:else if canOfferCode}
        <button
          type="button"
          onclick={() => (codeRevealed = true)}
          class="mb-3 text-sm text-neutral-500 underline hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          Have an invite code?
        </button>
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
        {#if showCode}
          <button
            type="button"
            onclick={onSubmit}
            disabled={joinState.busy || !code.trim()}
            class="bg-accent hover:bg-accent-hover rounded px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {joinState.busy ? "Joining…" : "Join"}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
