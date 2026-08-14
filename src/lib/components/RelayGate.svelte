<script lang="ts">
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import { relayAccess, probeRelayAccess } from "$lib/access.svelte";
  import { auth, openLogin } from "$lib/auth.svelte";
  import { joinRelay, joinState } from "$lib/join.svelte";
  import { TITLE } from "$lib/config";

  // The relay's NIP-11 name is readable even when nothing else is, so the
  // gate can still say which forum this is.
  const title = $derived(TITLE || relayAccess.info?.name || "Forum");
  const description = $derived(relayAccess.info?.description ?? "");
  const state = $derived(relayAccess.state);
  // A logged-in user still refused with auth-required means the handshake
  // failed rather than that they must log in; offer a retry instead.
  const authFailed = $derived(state === "auth-required" && !!auth.signer);

  function onLogin() {
    openLogin(() => {
      probeRelayAccess();
    });
  }

  function onJoin() {
    joinRelay(() => {
      probeRelayAccess();
    });
  }
</script>

<svelte:head>
  <title>{title}</title>
</svelte:head>

<div class="flex min-h-dvh flex-col">
  <div class="flex justify-end p-4">
    <ThemeToggle />
  </div>
  <main
    class="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center"
  >
    {#if relayAccess.info?.icon}
      <img
        src={relayAccess.info.icon}
        alt=""
        class="mb-6 h-20 w-20 rounded-full object-cover"
      />
    {/if}
    <h1 class="text-accent text-3xl font-semibold">{title}</h1>
    {#if description}
      <p class="mt-2 max-w-md text-neutral-600 dark:text-neutral-400">
        {description}
      </p>
    {/if}

    <div class="mt-8 max-w-md" role="status" aria-live="polite">
      {#if state === "checking"}
        <p class="text-sm text-neutral-500 dark:text-neutral-400">
          Checking access…
        </p>
      {:else if authFailed}
        <p class="text-neutral-700 dark:text-neutral-300">
          The relay did not accept your login.
        </p>
        <button
          type="button"
          onclick={() => probeRelayAccess()}
          class="bg-accent hover:bg-accent-hover mt-5 rounded px-6 py-2 font-medium text-white"
        >
          Retry
        </button>
      {:else if state === "auth-required"}
        <p class="text-neutral-700 dark:text-neutral-300">
          You need to log in to access this forum.
        </p>
        <button
          type="button"
          onclick={onLogin}
          class="bg-accent hover:bg-accent-hover mt-5 rounded px-6 py-2 font-medium text-white"
        >
          Log in
        </button>
      {:else if state === "restricted"}
        <p class="text-neutral-700 dark:text-neutral-300">
          This forum is for members only.
        </p>
        <button
          type="button"
          onclick={onJoin}
          disabled={joinState.busy}
          class="bg-accent hover:bg-accent-hover mt-5 rounded px-6 py-2 font-medium text-white disabled:opacity-50"
        >
          {joinState.busy ? "Joining…" : "Join this forum"}
        </button>
      {:else if state === "blocked"}
        <p class="text-neutral-700 dark:text-neutral-300">
          You can't access this forum.
        </p>
        {#if relayAccess.message}
          <p class="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            {relayAccess.message}
          </p>
        {/if}
      {/if}
    </div>
  </main>
</div>
