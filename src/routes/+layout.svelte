<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";
  import Navbar from "$lib/components/Navbar.svelte";
  import LeftSidebar from "$lib/components/LeftSidebar.svelte";
  import MobileMenu from "$lib/components/MobileMenu.svelte";
  import ChatSidebar from "$lib/components/ChatSidebar.svelte";
  import LatestDiscussions from "$lib/components/LatestDiscussions.svelte";
  import LoginModal from "$lib/components/LoginModal.svelte";
  import SearchModal from "$lib/components/SearchModal.svelte";
  import JoinModal from "$lib/components/JoinModal.svelte";
  import NewDiscussionModal from "$lib/components/NewDiscussionModal.svelte";
  import DeleteModal from "$lib/components/DeleteModal.svelte";
  import Toast from "$lib/components/Toast.svelte";
  import RelayGate from "$lib/components/RelayGate.svelte";
  import { page } from "$app/state";
  import { afterNavigate } from "$app/navigation";
  import { onMount, untrack } from "svelte";
  import { auth, restoreSession } from "$lib/auth.svelte";
  import { loadGroup } from "$lib/group.svelte";
  import { ensureMembershipChecked } from "$lib/join.svelte";
  import { loadGroups, groupsStore } from "$lib/groups.svelte";
  import { loadResources } from "$lib/resources.svelte";
  import { loadPartials } from "$lib/partials.svelte";
  import { loadRoomAdmins } from "$lib/admins.svelte";
  import { seedProfiles } from "$lib/profiles.svelte";
  import { startChat } from "$lib/chat.svelte";
  import { resetForumConnection } from "$lib/relay";
  import { relayAccess, probeRelayAccess } from "$lib/access.svelte";
  import { activeGroup, setActiveGroup } from "$lib/active.svelte";
  import {
    MODE,
    ACCENT_COLOR,
    SECONDARY_COLOR,
    SEARCH_ENABLED,
  } from "$lib/config";

  let { children } = $props();

  // Optional env overrides for the theme colors. Set as inline custom props on
  // <html> so they outrank the @theme `:root` defaults; hover shades are derived
  // by darkening the base 15% so admins only set one value per color.
  $effect(() => {
    const root = document.documentElement;
    if (ACCENT_COLOR) {
      root.style.setProperty("--color-accent", ACCENT_COLOR);
      root.style.setProperty(
        "--color-accent-hover",
        `color-mix(in srgb, ${ACCENT_COLOR} 85%, #000)`,
      );
    }
    if (SECONDARY_COLOR) {
      root.style.setProperty("--color-secondary", SECONDARY_COLOR);
      root.style.setProperty(
        "--color-secondary-hover",
        `color-mix(in srgb, ${SECONDARY_COLOR} 85%, #000)`,
      );
    }
  });

  const mode = MODE;
  const chatEnabled = true;

  // The main column is its own scroll container (overflow-y-auto) and persists
  // across navigations, so SvelteKit's window-only scroll restoration never
  // resets it. Scroll it back to top on forward navigation; leave back/forward
  // (popstate) alone so returning to a listing keeps its place.
  let mainEl = $state<HTMLElement | null>(null);
  afterNavigate((nav) => {
    if (nav.type !== "popstate") mainEl?.scrollTo(0, 0);
  });

  // Nothing is fetched until the relay confirms it will serve this visitor:
  // the probe runs once the stored signer is in place (restoreSession sets it
  // synchronously, before its profile fetch), and every probe that ends open
  // (re)loads the forum below.
  onMount(() => {
    restoreSession();
    probeRelayAccess();
  });

  async function loadForum() {
    loadResources();
    loadPartials();
    const tasks = [loadGroup()];
    if (mode === "full") tasks.push(loadGroups());
    await Promise.all(tasks);
    // Resources are filtered by the admin set; in full mode that means every
    // room's admins, needed on every page for the sidebar.
    if (mode === "full") loadRoomAdmins(groupsStore.list.map((g) => g.id));
    seedProfiles(auth.user?.pubkey ?? null);
  }

  // Each completed probe that finds the relay open reloads the room views: on
  // first load, after a login (private/hidden rooms appear) or logout (they
  // vanish), and after joining a members-only relay.
  $effect(() => {
    relayAccess.probes;
    if (relayAccess.state === "open") untrack(loadForum);
  });

  // Re-probe when the user logs in or out. sessionEpoch only bumps on explicit
  // login/logout, never on the silent restore that onMount already covers.
  let lastEpoch = -1;
  $effect(() => {
    const epoch = auth.sessionEpoch;
    if (epoch === lastEpoch) return;
    const first = lastEpoch === -1;
    const loggedOut = auth.user === null;
    lastEpoch = epoch;
    if (first) return;
    // On logout, drop the authenticated connection so the relay stops serving
    // the previous user's private rooms; login reuses the open connection,
    // which ensureForumReady authenticates via its stored challenge.
    if (loggedOut) resetForumConnection();
    probeRelayAccess();
  });

  // Full mode: the room route defines the active group. Thread pages set it
  // themselves from the thread's own group, so only track the slug here.
  $effect(() => {
    if (mode === "full" && page.params.slug) setActiveGroup(page.params.slug);
  });

  // Chat follows the active group, re-subscribing whenever the room changes.
  $effect(() => {
    if (chatEnabled && activeGroup.id) startChat(activeGroup.id);
  });

  // Pre-warm membership for the active room so the join gates resolve before
  // the user reaches a composer (no flash, no wasted typing). Depends on
  // auth.user so a silent session restore re-runs the check.
  $effect(() => {
    auth.user;
    if (activeGroup.id) ensureMembershipChecked(activeGroup.id);
  });

  let chatExpanded = $state(false);
  let menuOpen = $state(false);
  let mobileView = $state<"forum" | "chat">("forum");

  // Room pages highlight via their slug; thread pages highlight the room the
  // thread belongs to (tracked in activeGroup). Scoped to those routes so a
  // resource slug (same [slug] param name) never highlights a room.
  const activeRoom = $derived(
    page.url.pathname.startsWith("/room/")
      ? (page.params.slug ?? "")
      : page.url.pathname.startsWith("/thread/")
        ? activeGroup.id
        : "",
  );

  // Resource pages highlight the open article in the Resources menu.
  const activeResource = $derived(
    page.url.pathname.startsWith("/resource/") ? (page.params.slug ?? "") : "",
  );
  const contactsActive = $derived(page.url.pathname === "/contacts");

  // Standalone pages (articles, contacts) and the full-mode landing have no
  // single room to chat in, so they render the latest-discussions panel instead
  // of room chat. The simple-mode home keeps its room chat, like every room.
  const isArticle = $derived(page.url.pathname.startsWith("/resource/"));
  const showDiscussions = $derived(
    isArticle ||
      contactsActive ||
      (mode === "full" && page.url.pathname === "/"),
  );
  const showChat = $derived(chatEnabled && !showDiscussions);

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

{#if relayAccess.state !== "open"}
  <RelayGate />
{:else}
  <div
    class="mx-auto flex max-w-[1540px] flex-col md:h-screen md:overflow-hidden {mobileView ===
    'chat'
      ? 'h-dvh overflow-hidden'
      : ''}"
  >
    <Navbar onMenuToggle={() => (menuOpen = true)} />
    <div
      class="relative md:flex md:flex-1 md:gap-5 md:overflow-hidden {mobileView ===
      'chat'
        ? 'flex flex-1 overflow-hidden'
        : ''}"
    >
      <LeftSidebar {mode} {activeRoom} {activeResource} {contactsActive} />
      <main
        bind:this={mainEl}
        class="no-scrollbar md:min-h-0 md:overflow-y-auto {showDiscussions
          ? 'md:flex-[3]'
          : 'md:flex-1'}
			{mobileView === 'chat' ? 'hidden md:block' : 'block'}"
      >
        <!-- Gray top margin lives inside the scroll area, so scrolling collapses
           it first and it reappears once the top is reached. Desktop only. -->
        <div class="hidden md:block md:h-6" aria-hidden="true"></div>
        <div
          class="min-h-[calc(100dvh_-_4rem)] bg-white px-6 pt-4 pb-20 shadow-lg md:min-h-full md:rounded-t-xl md:px-10 md:pt-6 md:pt-8 dark:bg-neutral-900"
        >
          {@render children()}
        </div>
      </main>
      {#if showChat}
        <div class="hidden w-80 shrink-0 md:block" aria-hidden="true"></div>
        <ChatSidebar
          expanded={chatExpanded}
          onToggle={() => (chatExpanded = !chatExpanded)}
          mobileActive={mobileView === "chat"}
        />
      {:else if showDiscussions}
        <!-- Own panel (40%) so the gray gutter matches the main↔chat gap.
           Hidden on mobile — it's supplementary to the main column. -->
        <div
          class="no-scrollbar hidden min-w-0 md:block md:min-h-0 md:flex-[2] md:overflow-y-auto"
        >
          <div class="hidden md:block md:h-6" aria-hidden="true"></div>
          <div
            class="bg-white px-6 pt-8 pb-20 shadow-lg md:min-h-full md:rounded-t-xl md:px-8 md:pt-6 dark:bg-neutral-900"
          >
            <LatestDiscussions />
          </div>
        </div>
      {/if}
    </div>
    {#if showChat}
      <nav
        class="fixed inset-x-0 bottom-0 z-30 flex border-t border-neutral-200 bg-neutral-100 md:hidden dark:border-neutral-700 dark:bg-neutral-800"
        aria-label="Switch view"
      >
        <button
          type="button"
          onclick={() => (mobileView = "forum")}
          aria-pressed={mobileView === "forum"}
          class="flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium
				{mobileView === 'forum'
            ? 'text-accent'
            : 'text-neutral-500 dark:text-neutral-400'}"
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
				{mobileView === 'chat'
            ? 'text-accent'
            : 'text-neutral-500 dark:text-neutral-400'}"
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
{/if}

<MobileMenu
  open={menuOpen}
  onClose={() => (menuOpen = false)}
  {mode}
  {activeRoom}
  {activeResource}
  {contactsActive}
/>

<LoginModal />
{#if SEARCH_ENABLED}
  <SearchModal />
{/if}
<JoinModal />
<NewDiscussionModal />
<DeleteModal />
<Toast />
