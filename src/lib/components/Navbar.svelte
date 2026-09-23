<script lang="ts">
  import { groupStore } from "$lib/group.svelte";
  import { auth } from "$lib/auth.svelte";
  import { notificationsStore } from "$lib/notifications.svelte";
  import { GROUP_ID, TITLE, MODE } from "$lib/config";
  import UserAvatar from "$lib/components/UserAvatar.svelte";

  type Props = { onMenuToggle: () => void };
  let { onMenuToggle }: Props = $props();

  const unread = $derived(notificationsStore.unreadCount);
  const profileLabel = $derived(
    unread > 0
      ? `Your profile, ${unread} new notification${unread === 1 ? "" : "s"}`
      : "Your profile",
  );

  // PUBLIC_TITLE always wins when set. Without it, simple mode shows the room's
  // own name; full mode has no single room, so it falls back to GROUP_ID.
  const name = $derived(
    TITLE ||
      (MODE === "simple" ? (groupStore.data?.name ?? GROUP_ID) : GROUP_ID),
  );
</script>

<!-- Mobile only: on desktop the logo lives at the top of the left sidebar. -->
<header
  class="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-2 bg-neutral-100 px-4 md:hidden dark:bg-neutral-800"
>
  <a
    href="/"
    class="flex min-w-0 items-center gap-2 hover:opacity-90"
    aria-label="{name} — home"
  >
    {#if groupStore.data?.picture}
      <img
        src={groupStore.data.picture}
        alt=""
        class="h-9 w-9 shrink-0 rounded-full object-cover"
      />
    {:else}
      <div
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500 font-bold text-white"
      >
        {name[0].toUpperCase()}
      </div>
    {/if}
    <span
      class="truncate text-2xl font-medium text-neutral-900 md:text-[1.7rem] dark:text-neutral-100"
      >{name}</span
    >
  </a>
  {#if auth.user}
    <a
      href="/profile/{auth.user.npub}"
      class="ml-auto shrink-0 rounded p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700"
      aria-label={profileLabel}
    >
      <UserAvatar size="md" />
    </a>
  {/if}
  <button
    type="button"
    onclick={onMenuToggle}
    class="-mr-1 shrink-0 rounded p-1.5 text-neutral-700 hover:bg-neutral-200 md:hidden dark:text-neutral-300 dark:hover:bg-neutral-700"
    aria-label="Open menu"
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
  </button>
</header>
