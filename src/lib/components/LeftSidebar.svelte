<script lang="ts">
  import { auth, openLogin } from "$lib/auth.svelte";
  import { groupStore } from "$lib/group.svelte";
  import { groupsStore } from "$lib/groups.svelte";
  import { resourcesStore } from "$lib/resources.svelte";
  import { draftState, resumeDraft } from "$lib/draft.svelte";
  import { GROUP_ID, TITLE, SEARCH_ENABLED } from "$lib/config";
  import { openSearch } from "$lib/searchModal.svelte";
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import UserAvatar from "$lib/components/UserAvatar.svelte";
  import { notificationsStore } from "$lib/notifications.svelte";

  const unread = $derived(notificationsStore.unreadCount);
  const profileLabel = $derived(
    unread > 0
      ? `Your profile, ${unread} new notification${unread === 1 ? "" : "s"}`
      : "Your profile",
  );

  type Props = {
    mode: "simple" | "full";
    activeRoom?: string;
    activeResource?: string;
    contactsActive?: boolean;
  };

  let { mode, activeRoom, activeResource, contactsActive }: Props = $props();

  // Brand at the top: logo when set, otherwise the title/name as text. Mirrors
  // the mobile header's name logic (PUBLIC_TITLE wins; simple mode falls back to
  // the room name, full mode to GROUP_ID).
  const name = $derived(
    TITLE ||
      (mode === "simple" ? (groupStore.data?.name ?? GROUP_ID) : GROUP_ID),
  );

  // The description of the room currently being viewed (full mode).
  const activeAbout = $derived(
    groupsStore.list.find((g) => g.id === activeRoom)?.about ?? "",
  );

  // Bottom fade shown while the nav has more content below the fold.
  let navEl = $state<HTMLElement | null>(null);
  let moreBelow = $state(false);

  function updateFade() {
    const el = navEl;
    if (!el) return;
    moreBelow = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
  }

  $effect(() => {
    const el = navEl;
    if (!el) return;
    const ro = new ResizeObserver(updateFade);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    return () => ro.disconnect();
  });
</script>

<aside
  class="hidden max-w-52 min-w-48 shrink-0 flex-col justify-between pr-1 pb-8 pl-8 md:flex md:min-h-0 md:pt-6"
>
  <!-- Own scroll container so a long about/rooms list never pushes the
     account row off screen (the page wrapper clips overflow). -->
  <div class="relative min-h-0 flex-1">
    <div
      bind:this={navEl}
      onscroll={updateFade}
      class="no-scrollbar h-full overflow-y-auto"
    >
      <a
        href="/"
        class="mt-3 mb-6 flex min-w-0 flex-col hover:opacity-90"
        aria-label="{name} — home"
      >
        {#if groupStore.data?.picture}
          <img
            src={groupStore.data.picture}
            alt={name}
            class="max-w-[90%] shrink-0 object-cover"
          />
        {/if}
        <span
          class="mt-2 text-[1.3rem] leading-6 font-medium text-neutral-900 dark:text-neutral-100"
          >{name}</span
        >
      </a>

      <a
        href="/"
        class="flex items-center gap-2 py-1 text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
      >
        {mode === "simple" ? "Discussions" : "Home"}
      </a>

      {#if SEARCH_ENABLED}
        <button
          type="button"
          onclick={openSearch}
          class="flex w-full items-center gap-2 py-1 text-left text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Search
          <kbd
            class="ml-auto flex h-5 w-5 items-center justify-center rounded bg-neutral-200 font-sans text-xs text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
            aria-hidden="true">/</kbd
          >
        </button>
      {/if}

      {#if mode === "simple"}
        <div class="mt-6 flex">
          <p class="text-sm text-neutral-500 dark:text-neutral-400">
            {groupStore.data?.about ?? ""}
          </p>
        </div>
      {:else}
        {#if activeAbout}
          <div class="mt-6">
            <p
              class="pb-1 text-xs font-semibold tracking-wider text-neutral-400 uppercase dark:text-neutral-500"
            >
              About
            </p>
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              {activeAbout}
            </p>
          </div>
        {/if}
        <nav class="mt-6 flex-auto" aria-label="Rooms">
          <p
            class="pb-1 text-xs font-semibold tracking-wider text-neutral-400 uppercase dark:text-neutral-500"
          >
            Rooms
          </p>
          {#if groupsStore.list.length === 0 && !groupsStore.loaded}
            <p class="py-1 text-sm text-neutral-400 dark:text-neutral-500">
              Loading rooms…
            </p>
          {/if}
          {#each groupsStore.list as room}
            <a
              href="/room/{room.id}"
              class="flex items-center gap-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-800
							{activeRoom === room.id
                ? ' text-accent'
                : 'text-neutral-700 dark:text-neutral-300'}"
            >
              {room.name}
            </a>
          {/each}
        </nav>
      {/if}

      <nav class="mt-6 flex-auto" aria-label="Resources">
        <p
          class="pb-1 text-xs font-semibold tracking-wider text-neutral-400 uppercase dark:text-neutral-500"
        >
          Resources
        </p>
        {#each resourcesStore.list as r (r.slug)}
          <a
            href="/resource/{r.slug}"
            aria-current={activeResource === r.slug ? "page" : undefined}
            class="block py-1 hover:text-neutral-900 dark:hover:text-neutral-100
            {activeResource === r.slug
              ? 'text-accent'
              : 'text-neutral-500 dark:text-neutral-400'}">{r.title}</a
          >
        {/each}
        <a
          href="/contacts"
          aria-current={contactsActive ? "page" : undefined}
          class="block py-1 hover:text-neutral-900 dark:hover:text-neutral-100
          {contactsActive
            ? 'text-accent'
            : 'text-neutral-500 dark:text-neutral-400'}">Contacts</a
        >
      </nav>
    </div>
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent to-neutral-100 transition-opacity dark:to-neutral-800 {moreBelow
        ? 'opacity-100'
        : 'opacity-0'}"
      aria-hidden="true"
    ></div>
  </div>

  <div class="flex flex-col gap-2">
    {#if draftState.iconized}
      <button
        type="button"
        onclick={resumeDraft}
        class="bg-accent hover:bg-accent-hover w-full rounded px-3 py-1.5 text-sm font-medium text-white"
      >
        Resume draft
      </button>
    {/if}
    {#if auth.user}
      <div class="mt-3 flex items-center gap-1">
        <a
          href="/profile/{auth.user.npub}"
          class="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-200 dark:text-neutral-300 dark:hover:bg-neutral-700"
          aria-label={profileLabel}
        >
          <UserAvatar />
          <span class="truncate font-medium">{auth.user.shortName}</span>
        </a>
        <ThemeToggle />
      </div>
    {:else}
      <div class="mt-3 flex items-center gap-1">
        <button
          onclick={() => openLogin()}
          class="bg-accent hover:bg-accent-hover min-w-0 flex-1 rounded px-3 py-1.5 text-sm font-medium text-white"
        >
          Login
        </button>
        <ThemeToggle />
      </div>
    {/if}
  </div>
</aside>
