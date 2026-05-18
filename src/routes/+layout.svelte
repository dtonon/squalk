<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";
  import Navbar from "$lib/components/Navbar.svelte";
  import LeftSidebar from "$lib/components/LeftSidebar.svelte";
  import MobileMenu from "$lib/components/MobileMenu.svelte";
  import ChatSidebar from "$lib/components/ChatSidebar.svelte";
  import LoginModal from "$lib/components/LoginModal.svelte";
  import JoinModal from "$lib/components/JoinModal.svelte";
  import NewDiscussionModal from "$lib/components/NewDiscussionModal.svelte";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { auth, restoreSession } from "$lib/auth.svelte";
  import { loadGroup } from "$lib/group.svelte";
  import { seedProfiles } from "$lib/profiles.svelte";
  import { startChat } from "$lib/chat.svelte";
  import { MODE } from "$lib/config";

  let { children } = $props();

  const mode = MODE;
  const chatEnabled = true;

  onMount(async () => {
    await Promise.all([restoreSession(), loadGroup()]);
    seedProfiles(auth.user?.pubkey ?? null);
    if (chatEnabled) startChat();
  });

  let chatExpanded = $state(false);
  let menuOpen = $state(false);
  let mobileView = $state<"forum" | "chat">("forum");

  const activeRoom = $derived(page.params.slug ?? "");

  // On mobile a route change should always land on the forum pane, so opening
  // a thread or room from the menu never leaves the user stranded on chat.
  $effect(() => {
    page.url.pathname;
    mobileView = "forum";
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div
  class="mx-auto flex max-w-[1540px] flex-col md:h-screen md:overflow-hidden {mobileView ===
  'chat'
    ? 'h-dvh overflow-hidden'
    : ''}"
>
  <Navbar onMenuToggle={() => (menuOpen = true)} />
  <div
    class="relative md:flex md:flex-1 md:overflow-hidden md:gap-5 md:pt-2 {mobileView ===
    'chat'
      ? 'flex flex-1 overflow-hidden'
      : ''}"
  >
    <LeftSidebar {mode} {activeRoom} />
    <main
      class="min-h-[calc(100dvh_-_4rem)] bg-white px-6 pt-8 pb-20 shadow-lg md:min-h-0 md:flex-1 md:overflow-y-auto md:rounded-t-xl md:px-10 md:pt-6
			{mobileView === 'chat' ? 'hidden md:block' : 'block'}"
    >
      {@render children()}
    </main>
    {#if chatEnabled}
      <div class="hidden w-80 shrink-0 md:block" aria-hidden="true"></div>
      <ChatSidebar
        expanded={chatExpanded}
        onToggle={() => (chatExpanded = !chatExpanded)}
        mobileActive={mobileView === "chat"}
      />
    {/if}
  </div>
  {#if chatEnabled}
    <nav
      class="fixed inset-x-0 bottom-0 z-30 flex border-t border-neutral-200 bg-neutral-100 md:hidden"
      aria-label="Switch view"
    >
      <button
        type="button"
        onclick={() => (mobileView = "forum")}
        aria-pressed={mobileView === "forum"}
        class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium
				{mobileView === 'forum' ? 'text-brand' : 'text-neutral-500'}"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
        Forum
      </button>
      <button
        type="button"
        onclick={() => (mobileView = "chat")}
        aria-pressed={mobileView === "chat"}
        class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium
				{mobileView === 'chat' ? 'text-brand' : 'text-neutral-500'}"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.8"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z"
          />
        </svg>
        Chat
      </button>
    </nav>
  {/if}
</div>

<MobileMenu
  open={menuOpen}
  onClose={() => (menuOpen = false)}
  {mode}
  {activeRoom}
/>

<LoginModal />
<JoinModal />
<NewDiscussionModal />
