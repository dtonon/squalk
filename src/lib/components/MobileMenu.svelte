<script lang="ts">
  import { fly, fade } from "svelte/transition";
  import { groupsStore } from "$lib/groups.svelte";
  import { resourcesStore } from "$lib/resources.svelte";
  import { auth, openLogin, logout } from "$lib/auth.svelte";
  import { openSearch } from "$lib/searchModal.svelte";
  import { SEARCH_ENABLED } from "$lib/config";
  import { draftState, resumeDraft } from "$lib/draft.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";

  type Props = {
    open: boolean;
    onClose: () => void;
    mode: "simple" | "full";
    activeRoom?: string;
    activeResource?: string;
    contactsActive?: boolean;
  };

  let {
    open,
    onClose,
    mode,
    activeRoom,
    activeResource,
    contactsActive,
  }: Props = $props();

  function onLogin() {
    onClose();
    openLogin();
  }

  function onLogout() {
    if (confirm("Log out?")) {
      logout();
      onClose();
    }
  }

  function onResume() {
    onClose();
    resumeDraft();
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === "Escape") onClose();
  }

  // Swipe-to-close: the drawer sits on the right, so a rightward swipe dismisses it.
  let touchStartX = 0;
  let touchStartY = 0;
  let swiping = false;

  function onTouchStart(e: TouchEvent) {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    swiping = false;
  }

  function onTouchMove(e: TouchEvent) {
    const dx = e.touches[0].clientX - touchStartX;
    const dy = e.touches[0].clientY - touchStartY;
    if (Math.abs(dx) > Math.abs(dy)) swiping = true;
  }

  function onTouchEnd(e: TouchEvent) {
    if (!swiping) return;
    if (e.changedTouches[0].clientX - touchStartX > 60) onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if open}
  <div class="fixed inset-0 z-40 md:hidden">
    <button
      type="button"
      aria-label="Close menu"
      class="absolute inset-0 bg-black/40"
      onclick={onClose}
      transition:fade={{ duration: 150 }}
    ></button>
    <div
      class="absolute inset-y-0 right-0 flex w-72 max-w-[80%] flex-col bg-white dark:bg-neutral-900 px-6 py-4 shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      tabindex="-1"
      ontouchstart={onTouchStart}
      ontouchmove={onTouchMove}
      ontouchend={onTouchEnd}
      transition:fly={{ x: 300, duration: 200 }}
    >
      <div class="flex justify-end">
        <button
          type="button"
          onclick={onClose}
          class="-mr-1 rounded p-1 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          aria-label="Close menu"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-7 w-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="mt-auto flex flex-col overflow-y-auto">
        <a
          href="/"
          onclick={onClose}
          class="hover:text-accent py-2 text-xl text-neutral-700 dark:text-neutral-300"
          >{mode === "simple" ? "Discussions" : "Home"}</a
        >

        {#if SEARCH_ENABLED}
          <button
            type="button"
            onclick={() => {
              onClose();
              openSearch();
            }}
            class="hover:text-accent py-2 text-left text-xl text-neutral-700 dark:text-neutral-300"
          >
            Search
          </button>
        {/if}

        {#if mode === "full"}
          <nav class="mt-4" aria-label="Rooms">
            <p
              class="pb-1 font-semibold tracking-wider text-neutral-400 dark:text-neutral-500 uppercase"
            >
              Rooms
            </p>
            {#if groupsStore.list.length === 0 && !groupsStore.loaded}
              <p class="py-1.5 text-base text-neutral-400 dark:text-neutral-500">Loading rooms…</p>
            {/if}
            {#each groupsStore.list as room}
              <a
                href="/room/{room.id}"
                onclick={onClose}
                class="block py-1.5 text-xl
									{activeRoom === room.id ? 'text-accent' : 'hover:text-accent text-neutral-700 dark:text-neutral-300'}"
              >
                {room.name}
              </a>
            {/each}
          </nav>
        {/if}

        <nav class="mt-4" aria-label="Resources">
          <p
            class="pb-1 font-semibold tracking-wider text-neutral-400 dark:text-neutral-500 uppercase"
          >
            Resources
          </p>
          {#each resourcesStore.list as r (r.slug)}
            <a
              href="/resource/{r.slug}"
              onclick={onClose}
              aria-current={activeResource === r.slug ? "page" : undefined}
              class="hover:text-accent block py-1.5 text-xl
                {activeResource === r.slug ? 'text-accent' : 'text-neutral-700 dark:text-neutral-300'}"
              >{r.title}</a
            >
          {/each}
          <a
            href="/contacts"
            onclick={onClose}
            aria-current={contactsActive ? "page" : undefined}
            class="hover:text-accent block py-1.5 text-lg
              {contactsActive ? 'text-accent' : 'text-neutral-700 dark:text-neutral-300'}">Contacts</a
          >
        </nav>

        <div class="mt-4 flex flex-col gap-2 border-t border-neutral-100 dark:border-neutral-800 pt-4">
          {#if draftState.iconized}
            <button
              type="button"
              onclick={onResume}
              class="bg-accent hover:bg-accent-hover w-full rounded px-3 py-2 font-medium text-white"
            >
              Resume draft
            </button>
          {/if}
          {#if auth.user}
            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick={onLogout}
                class="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-2 text-left text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                aria-label="Log out"
              >
                {#if auth.user.metadata.picture}
                  <img
                    src={auth.user.metadata.picture}
                    alt=""
                    class="h-8 w-8 rounded-full object-cover"
                  />
                {:else}
                  <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-300 text-sm font-semibold text-neutral-600 dark:text-neutral-400 dark:bg-neutral-600"
                    aria-hidden="true"
                  >
                    {auth.user.shortName.slice(0, 1).toUpperCase()}
                  </span>
                {/if}
                <span class="truncate text-lg font-medium"
                  >{auth.user.shortName}</span
                >
                <span
                  class="ml-auto shrink-0 text-sm text-neutral-400 dark:text-neutral-500"
                  >Log out</span
                >
              </button>
              <ThemeToggle size="md" />
            </div>
          {:else}
            <div class="flex items-center gap-2">
              <button
                type="button"
                onclick={onLogin}
                class="bg-accent hover:bg-accent-hover min-w-0 flex-1 rounded px-3 py-2 text-lg font-medium text-white"
              >
                Login
              </button>
              <ThemeToggle size="md" />
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
