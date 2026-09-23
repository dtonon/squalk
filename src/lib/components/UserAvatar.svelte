<script lang="ts">
  import { auth } from "$lib/auth.svelte";
  import { notificationsStore } from "$lib/notifications.svelte";

  type Props = { size?: "sm" | "md" };
  let { size = "sm" }: Props = $props();

  const box = $derived(size === "md" ? "h-8 w-8 text-sm" : "h-7 w-7 text-xs");
  const count = $derived(notificationsStore.unreadCount);
  const label = $derived(count > 99 ? "99+" : String(count));
</script>

<!-- Logged-in user's picture with the unread notifications count. The count is
   visual only; the wrapping link carries it in its accessible name. -->
{#if auth.user}
  <span class="relative inline-flex shrink-0">
    {#if auth.user.metadata.picture}
      <img
        src={auth.user.metadata.picture}
        alt=""
        class="{box} rounded-full object-cover"
      />
    {:else}
      <span
        class="{box} flex items-center justify-center rounded-full bg-neutral-300 font-semibold text-neutral-600 dark:bg-neutral-600 dark:text-neutral-400"
        aria-hidden="true"
      >
        {auth.user.shortName.slice(0, 1).toUpperCase()}
      </span>
    {/if}
    {#if count > 0}
      <span
        class="bg-accent absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold text-white"
        aria-hidden="true"
      >
        {label}
      </span>
    {/if}
  </span>
{/if}
