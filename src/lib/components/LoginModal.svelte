<script lang="ts">
  import {
    auth,
    closeLogin,
    loginWithExtension,
    loginWithNsec,
  } from "$lib/auth.svelte";
  import { tick } from "svelte";

  let view = $state<"extension" | "nsec">("extension");
  let nsec = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);
  let nsecInput = $state<HTMLInputElement | null>(null);

  const hasExtension = $derived(
    typeof window !== "undefined" && !!window.nostr,
  );

  function reset() {
    view = "extension";
    nsec = "";
    error = null;
  }

  async function handleExtension() {
    if (busy) return;
    error = null;
    busy = true;
    try {
      await loginWithExtension();
      closeLogin();
      reset();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to login";
    } finally {
      busy = false;
    }
  }

  async function handleNsec() {
    if (busy || !nsec.trim()) return;
    error = null;
    busy = true;
    try {
      await loginWithNsec(nsec);
      closeLogin();
      reset();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to login";
    } finally {
      busy = false;
    }
  }

  function onClose() {
    if (busy) return;
    closeLogin();
    reset();
  }

  async function showNsecView() {
    view = "nsec";
    error = null;
    await tick();
    nsecInput?.focus();
  }

  function showExtensionView() {
    view = "extension";
    error = null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (!auth.loginModalOpen) return;
    if (e.key === "Escape") onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if auth.loginModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <button
      type="button"
      aria-label="Close login"
      class="absolute inset-0 bg-black/40"
      onclick={onClose}
    ></button>
    <div
      class="relative w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
    >
      <button
        type="button"
        onclick={onClose}
        aria-label="Close"
        class="absolute right-3 top-3 text-2xl leading-none text-gray-400 hover:text-gray-700"
      >
        ×
      </button>

      <h2 id="login-title" class="mb-4 text-lg font-semibold text-gray-900">
        {view === "extension" ? "Log in" : "Log in with nsec"}
      </h2>

      {#if error}
        <div
          class="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      {/if}

      {#if view === "extension"}
        <button
          onclick={handleExtension}
          disabled={busy || !hasExtension}
          class="w-full rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Connecting…" : "Log in with extension"}
        </button>
        {#if !hasExtension}
          <p class="mt-2 text-xs text-gray-500">
            No Nostr extension detected in this browser.
          </p>
        {/if}
        <button
          type="button"
          onclick={showNsecView}
          class="mt-4 block w-full text-center text-sm text-brand hover:underline"
        >
          Or log in using your nsec
        </button>
      {:else}
        <label for="nsec-input" class="sr-only">nsec</label>
        <input
          id="nsec-input"
          bind:this={nsecInput}
          type="password"
          placeholder="nsec1…"
          bind:value={nsec}
          disabled={busy}
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          onkeydown={(e) => e.key === "Enter" && handleNsec()}
          class="w-full rounded border border-gray-200 px-3 py-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
        />
        <button
          onclick={handleNsec}
          disabled={busy || !nsec.trim()}
          class="mt-3 w-full rounded bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p class="mt-2 text-xs text-gray-500">
          Your key is kept in this browser. Use only for testing.
        </p>
        <button
          type="button"
          onclick={showExtensionView}
          class="mt-4 block w-full text-center text-sm text-brand hover:underline"
        >
          Log in with extension
        </button>
      {/if}
    </div>
  </div>
{/if}
