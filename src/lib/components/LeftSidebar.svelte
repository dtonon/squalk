<script lang="ts">
  import { auth, openLogin, logout } from "$lib/auth.svelte";
  import { groupStore } from "$lib/group.svelte";
  import { groupsStore } from "$lib/groups.svelte";
  import { resourcesStore } from "$lib/resources.svelte";
  import { draftState, resumeDraft } from "$lib/draft.svelte";

  type Props = {
    mode: "simple" | "full";
    activeRoom?: string;
  };

  let { mode, activeRoom }: Props = $props();

  // The description of the room currently being viewed (full mode).
  const activeAbout = $derived(
    groupsStore.list.find((g) => g.id === activeRoom)?.about ?? "",
  );
</script>

<aside
  class="hidden max-w-52 min-w-48 shrink-0 flex-col justify-between py-2 pl-8 pr-1 pb-8 md:flex"
>
  <div>
    <a
      href="/"
      class="flex items-center gap-2 py-1 hover:bg-neutral-100 text-neutral-700"
    >
      Home
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
          class="block py-1 text-neutral-500 hover:text-neutral-900"
          >{r.title}</a
        >
      {/each}
      <a
        href="/contacts"
        class="block py-1 text-neutral-500 hover:text-neutral-900">Contacts</a
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
