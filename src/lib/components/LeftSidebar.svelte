<script lang="ts">
  import { rooms } from "$lib/mock";
  import { auth, login, logout } from "$lib/auth.svelte";
  import { groupStore } from "$lib/group.svelte";

  type Props = {
    mode: "simple" | "full";
    activeRoom?: string;
  };

  let { mode, activeRoom }: Props = $props();

  const groups = [...new Set(rooms.map((r) => r.group))];
</script>

<aside
  class="flex max-w-52 min-w-48 shrink-0 flex-col justify-between py-2 pl-8 pr-1 pb-8"
>
  <div>
    <a
      href="/"
      class="flex items-center gap-2 py-1 hover:bg-gray-100 text-gray-700}"
    >
      Home
    </a>

    {#if mode === "simple"}
      <div class="flex mt-6">
        <p class="text-sm text-gray-500">{groupStore.data?.about ?? ""}</p>
      </div>
    {:else}
      <nav class="flex-auto mt-6">
        {#each groups as group}
          <div class="mb-8">
            <p
              class="pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400"
            >
              {group}
            </p>
            {#each rooms.filter((r) => r.group === group) as room}
              <a
                href="/room/{room.slug}"
                class="flex items-center gap-2 py-1 hover:bg-gray-100
								{activeRoom === room.slug ? ' text-brand' : 'text-gray-700'}"
              >
                {room.name}
              </a>
            {/each}
          </div>
        {/each}
      </nav>
    {/if}

    <nav class="flex-auto mt-6">
      <div class="">
        <p
          class="pb-1 text-xs font-semibold uppercase tracking-wider text-gray-400"
        >
          More
        </p>
        <a href="/settings" class="block py-1 text-gray-500 hover:text-gray-900"
          >Settings</a
        >
        <a href="/contacts" class="block py-1 text-gray-500 hover:text-gray-900"
          >Contacts</a
        >
      </div>
    </nav>
  </div>

  {#if auth.user}
    <button
      onclick={() => {
        if (confirm("Log out?")) logout();
      }}
      class="mt-3 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-200"
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
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-300 text-xs font-semibold text-gray-600"
          aria-hidden="true"
        >
          {auth.user.shortName.slice(0, 1).toUpperCase()}
        </span>
      {/if}
      <span class="truncate font-medium">{auth.user.shortName}</span>
    </button>
  {:else}
    <button
      onclick={login}
      class="mt-3 w-full rounded bg-brand px-3 py-1.5 font-medium text-sm text-white hover:bg-brand-hover"
    >
      Login
    </button>
  {/if}
</aside>
