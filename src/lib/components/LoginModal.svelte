<script lang="ts">
  import {
    auth,
    closeLogin,
    loginWithBunker,
    loginWithExtension,
    loginWithNostrConnect,
    loginWithNsec,
  } from "$lib/auth.svelte";
  import { onDestroy, tick } from "svelte";
  import { renderSVG } from "uqr";

  type View = "extension" | "bunker" | "nsec";

  let view = $state<View>("extension");
  let nsec = $state("");
  let bunkerUrl = $state("");
  let error = $state<string | null>(null);
  let busy = $state(false);
  let copied = $state(false);
  let nsecInput = $state<HTMLInputElement | null>(null);
  let bunkerInput = $state<HTMLInputElement | null>(null);

  // Client-initiated NIP-46 flow, alive only while the bunker view is shown
  let connect = $state<ReturnType<typeof loginWithNostrConnect> | null>(null);
  const qrSvg = $derived(
    connect ? renderSVG(connect.uri, { pixelSize: 4, border: 2 }) : "",
  );

  const hasExtension = $derived(
    typeof window !== "undefined" && !!window.nostr,
  );

  const titles: Record<View, string> = {
    extension: "Log in",
    bunker: "Log in with a bunker",
    nsec: "Log in with nsec",
  };

  function stopConnect() {
    connect?.cancel();
    connect = null;
  }

  function reset() {
    stopConnect();
    view = "extension";
    nsec = "";
    bunkerUrl = "";
    error = null;
    copied = false;
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

  async function handleBunker() {
    if (busy || !bunkerUrl.trim()) return;
    error = null;
    busy = true;
    try {
      await loginWithBunker(bunkerUrl);
      closeLogin();
      reset();
    } catch (e) {
      error =
        e instanceof Error ? e.message : "Failed to connect to the bunker";
    } finally {
      busy = false;
    }
  }

  function startConnect() {
    stopConnect();
    const nc = loginWithNostrConnect();
    connect = nc;
    nc.done
      .then(() => {
        if (connect !== nc) return;
        closeLogin();
        reset();
      })
      .catch((e) => {
        if (connect !== nc) return; // cancelled by leaving the view
        connect = null;
        error = `${e instanceof Error ? e.message : "Connection failed"}. Go back and retry.`;
      });
  }

  async function copyUri() {
    if (!connect) return;
    try {
      await navigator.clipboard.writeText(connect.uri);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      error = "Could not copy to the clipboard";
    }
  }

  function onClose() {
    if (busy) return;
    closeLogin();
    reset();
  }

  async function showNsecView() {
    stopConnect();
    view = "nsec";
    error = null;
    await tick();
    nsecInput?.focus();
  }

  async function showBunkerView() {
    view = "bunker";
    error = null;
    startConnect();
    await tick();
    bunkerInput?.focus();
  }

  function showExtensionView() {
    stopConnect();
    view = "extension";
    error = null;
  }

  function onKeydown(e: KeyboardEvent) {
    if (!auth.loginModalOpen) return;
    if (e.key === "Escape") onClose();
  }

  onDestroy(stopConnect);
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
      class="relative w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
    >
      <button
        type="button"
        onclick={onClose}
        aria-label="Close"
        class="absolute top-3 right-3 text-2xl leading-none text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300"
      >
        ×
      </button>

      <h2
        id="login-title"
        class="mb-4 text-lg font-semibold text-neutral-900 dark:text-neutral-100"
      >
        {titles[view]}
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
          class="bg-accent hover:bg-accent-hover w-full rounded px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Connecting…" : "Log in with extension"}
        </button>
        {#if !hasExtension}
          <p class="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            No Nostr extension detected in this browser.
          </p>
        {/if}
        <button
          type="button"
          onclick={showBunkerView}
          disabled={busy}
          class="bg-accent hover:bg-accent-hover mt-3 w-full rounded px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          Log in with a bunker
        </button>
        <button
          type="button"
          onclick={showNsecView}
          class="text-accent mt-4 block w-full text-center text-sm hover:underline"
        >
          Or log in using your nsec
        </button>
      {:else if view === "bunker"}
        {#if connect}
          <a
            href={connect.uri}
            aria-label="Open in your signer app"
            class="mx-auto block w-48 rounded bg-white p-1 [&>svg]:h-auto [&>svg]:w-full"
          >
            {@html qrSvg}
          </a>
          <button
            type="button"
            onclick={copyUri}
            aria-label={copied ? "Copied" : "Copy the connection string"}
            class="mx-auto mt-3 flex w-full max-w-64 items-center gap-2 rounded-full bg-neutral-100 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <span class="min-w-0 flex-1 truncate font-mono">{connect.uri}</span>
            <span class="shrink-0">{copied ? "Copied" : "Copy"}</span>
          </button>
          <p
            class="mt-2 text-center text-xs text-neutral-500 dark:text-neutral-400"
            aria-live="polite"
          >
            Scan or paste this in your signer app, then approve the connection.
          </p>
        {/if}

        <div class="my-4 flex items-center gap-3" aria-hidden="true">
          <div
            class="flex-1 border-t border-neutral-200 dark:border-neutral-700"
          ></div>
          <span class="text-xs text-neutral-400">or</span>
          <div
            class="flex-1 border-t border-neutral-200 dark:border-neutral-700"
          ></div>
        </div>

        <label
          for="bunker-input"
          class="mb-1 block text-sm text-neutral-700 dark:text-neutral-300"
        >
          Paste a bunker URL
        </label>
        <input
          id="bunker-input"
          bind:this={bunkerInput}
          type="text"
          placeholder="bunker://…"
          bind:value={bunkerUrl}
          disabled={busy}
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          onkeydown={(e) => e.key === "Enter" && handleBunker()}
          class="focus:ring-accent w-full rounded border border-neutral-200 px-3 py-2 font-mono text-sm focus:ring-1 focus:outline-none disabled:opacity-50 dark:border-neutral-700"
        />
        <button
          onclick={handleBunker}
          disabled={busy || !bunkerUrl.trim()}
          class="bg-accent hover:bg-accent-hover mt-3 w-full rounded px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Connecting…" : "Log in"}
        </button>
        <p class="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          A NIP-05 address that points to a bunker works too.
        </p>
        <button
          type="button"
          onclick={showExtensionView}
          disabled={busy}
          class="text-accent mt-4 block w-full text-center text-sm hover:underline disabled:opacity-50"
        >
          Back
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
          class="focus:ring-accent w-full rounded border border-neutral-200 px-3 py-2 font-mono text-sm focus:ring-1 focus:outline-none disabled:opacity-50 dark:border-neutral-700"
        />
        <button
          onclick={handleNsec}
          disabled={busy || !nsec.trim()}
          class="bg-accent hover:bg-accent-hover mt-3 w-full rounded px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p class="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          Your key is kept in this browser. Use only for testing.
        </p>
        <button
          type="button"
          onclick={showExtensionView}
          class="text-accent mt-4 block w-full text-center text-sm hover:underline"
        >
          Log in with extension
        </button>
      {/if}
    </div>
  </div>
{/if}
