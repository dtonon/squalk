<script lang="ts">
  import { auth, openLogin, logout } from "$lib/auth.svelte";
  import { groupStore } from "$lib/group.svelte";
  import { groupsStore } from "$lib/groups.svelte";
  import { resourcesStore } from "$lib/resources.svelte";
  import { draftState, resumeDraft } from "$lib/draft.svelte";
  import { GROUP_ID, TITLE } from "$lib/config";

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
</script>

<aside
  class="hidden max-w-52 min-w-48 shrink-0 flex-col justify-between pl-8 pr-1 pb-8 md:flex"
>
  <div>
    <a
      href="/"
      class="mb-6 mt-3 flex flex-col min-w-0 hover:opacity-90"
      aria-label="{name} — home"
    >
      {#if groupStore.data?.picture}
        <img
          src={groupStore.data.picture}
          alt={name}
          class="max-w-[90%] shrink-0 object-cover"
        />
      {/if}
      <span class="text-[1.3rem] font-medium text-neutral-900 mt-2 leading-6"
        >{name}</span
      >
    </a>

    <a
      href="/"
      class="flex items-center gap-2 py-1 hover:bg-neutral-100 text-neutral-700"
    >
      {mode === "simple" ? "Discussions" : "Home"}
    </a>

    {#if mode === "simple"}
      <div class="flex mt-6">
        <p class="text-sm text-neutral-500">{groupStore.data?.about ?? ""}</p>
      </div>
    {:else}
      <nav class="flex-auto mt-6" aria-label="Rooms">
        <p
          class="pb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400"
        >
          Rooms
        </p>
        {#if groupsStore.list.length === 0 && !groupsStore.loaded}
          <p class="py-1 text-sm text-neutral-400">Loading rooms…</p>
        {/if}
        {#each groupsStore.list as room}
          <a
            href="/room/{room.id}"
            class="flex items-center gap-2 py-1 hover:bg-neutral-100
							{activeRoom === room.id ? ' text-brand' : 'text-neutral-700'}"
          >
            {room.name}
          </a>
        {/each}
      </nav>
      {#if activeAbout}
        <div class="mt-6">
          <p
            class="pb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400"
          >
            About
          </p>
          <p class="text-sm text-neutral-500">{activeAbout}</p>
        </div>
      {/if}
    {/if}

    <nav class="flex-auto mt-6" aria-label="Resources">
      <p
        class="pb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400"
      >
        Resources
      </p>
      {#each resourcesStore.list as r (r.slug)}
        <a
          href="/resource/{r.slug}"
          aria-current={activeResource === r.slug ? "page" : undefined}
          class="block py-1 hover:text-neutral-900
            {activeResource === r.slug ? 'text-brand' : 'text-neutral-500'}"
          >{r.title}</a
        >
      {/each}
      <a
        href="/contacts"
        aria-current={contactsActive ? "page" : undefined}
        class="block py-1 hover:text-neutral-900
          {contactsActive ? 'text-brand' : 'text-neutral-500'}">Contacts</a
      >
    </nav>
  </div>

  <div class="flex flex-col gap-2">
    {#if draftState.iconized}
      <button
        type="button"
        onclick={resumeDraft}
        class="w-full rounded bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-hover"
      >
        Resume draft
      </button>
    {/if}
    {#if auth.user}
      <button
        onclick={() => {
          if (confirm("Log out?")) logout();
        }}
        class="mt-3 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-200"
        aria-label="Account options"
      >
        {#if auth.user.metadata.picture}
          <img
            src={auth.user.metadata.picture}
            alt=""
            class="h-7 w-7 rounded-full object-cover"
          />
        {:else}
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-300 text-xs font-semibold text-neutral-600"
            aria-hidden="true"
          >
            {auth.user.shortName.slice(0, 1).toUpperCase()}
          </span>
        {/if}
        <span class="truncate font-medium">{auth.user.shortName}</span>
      </button>
    {:else}
      <button
        onclick={openLogin}
        class="mt-3 w-full rounded bg-brand px-3 py-1.5 font-medium text-sm text-white hover:bg-brand-hover"
      >
        Login
      </button>
    {/if}
  </div>
</aside>
