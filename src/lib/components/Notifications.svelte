<script lang="ts">
  import { untrack } from "svelte";
  import { MODE } from "$lib/config";
  import { getGroupName } from "$lib/group.svelte";
  import { profileStore } from "$lib/profiles.svelte";
  import { profilePath } from "$lib/forum/profiles";
  import {
    notificationsStore,
    markNotificationsSeen,
    loadMoreNotifications,
    type Notification,
  } from "$lib/notifications.svelte";
  import { summarize } from "$lib/seo";
  import * as nip19 from "@nostr/tools/nip19";

  const PAGE = 5;

  const items = $derived(notificationsStore.items);
  // Visible slice; "Show more" reveals another page from what is loaded and
  // fetches older ones once the loaded list runs out.
  let shown = $state(PAGE);
  const visible = $derived(items?.slice(0, shown) ?? null);
  const hasMore = $derived(
    !!items && (items.length > shown || !notificationsStore.done),
  );

  async function showMore() {
    if (items && items.length <= shown) await loadMoreNotifications();
    shown += PAGE;
  }

  // Unread threshold frozen when the list first shows, so new items keep their
  // mark while on screen even though they are counted as seen right away.
  let openedAt = $state<number | null>(null);

  $effect(() => {
    if (!items) return;
    if (openedAt === null) {
      const seenAt = untrack(() => notificationsStore.seenAt);
      openedAt = seenAt;
      // Every new item is visible at once; the page size is only a floor
      const unread = items.filter((n) => n.createdAt > seenAt).length;
      shown = Math.max(PAGE, unread);
    }
    markNotificationsSeen();
  });

  function authorName(pubkey: string): string {
    const p = profileStore.profiles.get(pubkey);
    return (
      p?.displayName ||
      p?.name ||
      `${(p?.npub ?? nip19.npubEncode(pubkey)).slice(0, 12)}…`
    );
  }

  function authorPicture(pubkey: string): string | undefined {
    return profileStore.profiles.get(pubkey)?.picture;
  }

  function verb(n: Notification): string {
    switch (n.kind) {
      case "quote":
      case "reply-op":
        return "replied to you in";
      case "reply":
        return "wrote in";
      case "mention":
        return "mentioned you in";
      case "chat-reply":
        return "replied to you in chat";
      case "chat-mention":
        return MODE === "full" ? "mentioned you in" : "mentioned you in chat";
    }
  }

  function href(n: Notification): string {
    if (n.threadId) return `/thread/${n.threadId}#post-${n.id}`;
    const room = MODE === "full" ? `/room/${n.groupId}` : "/";
    return `${room}#chat-${n.id}`;
  }

  function formatTime(ts: number): string {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`;
    return new Date(ts * 1000).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
</script>

<section aria-labelledby="profile-notifications" class="mt-10">
  <h2
    id="profile-notifications"
    class="text-accent border-b border-neutral-100 pb-2 text-[1.5rem] leading-7 dark:border-neutral-800"
  >
    Notifications
  </h2>
  {#if !items}
    <p class="py-3 text-sm text-neutral-400 dark:text-neutral-500">Loading…</p>
  {:else if items.length === 0}
    <p class="py-3 text-sm text-neutral-400 dark:text-neutral-500">
      No replies or mentions yet.
    </p>
  {:else}
    <ul class="divide-y divide-neutral-100 dark:divide-neutral-800">
      {#each visible ?? [] as n (n.id)}
        {@const unread = n.createdAt > (openedAt ?? 0)}
        {@const name = authorName(n.pubkey)}
        {@const picture = authorPicture(n.pubkey)}
        {@const text = summarize(n.content, 160)}
        <li class="flex gap-3 py-3">
          <a
            href={profilePath(n.pubkey)}
            class="mt-0.5 shrink-0"
            aria-hidden="true"
            tabindex="-1"
          >
            {#if picture}
              <img
                src={picture}
                alt=""
                class="h-8 w-8 rounded-full object-cover"
              />
            {:else}
              <span
                class="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
              >
                {name[0].toUpperCase()}
              </span>
            {/if}
          </a>
          <div class="min-w-0 flex-1">
            <a href={href(n)} class="group block">
              <p
                class="text-neutral-900 dark:text-neutral-100 {unread
                  ? 'font-semibold'
                  : ''}"
              >
                {#if unread}
                  <span
                    class="bg-accent mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                    aria-hidden="true"
                  ></span>
                  <span class="sr-only">New: </span>
                {/if}
                <span>{name}</span>
                <span
                  class="font-normal text-neutral-500 dark:text-neutral-400"
                >
                  {verb(n)}
                </span>
                {#if n.threadId}
                  <span class="group-hover:text-accent">
                    {n.title || "a discussion"}
                  </span>
                {:else if n.kind === "chat-mention" && MODE === "full"}
                  <span class="group-hover:text-accent"
                    >{getGroupName(n.groupId)}</span
                  >
                  <span
                    class="font-normal text-neutral-500 dark:text-neutral-400"
                    >chat</span
                  >
                {/if}
              </p>
              {#if text}
                <p
                  class="mt-0.5 line-clamp-2 text-neutral-600 dark:text-neutral-400"
                >
                  {text}
                </p>
              {/if}
            </a>
            <div
              class="mt-1 flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500"
            >
              {#if MODE === "full" && n.groupId}
                <a href="/room/{n.groupId}" class="hover:text-accent truncate"
                  >{getGroupName(n.groupId)}</a
                >
                <span aria-hidden="true">·</span>
              {/if}
              <time datetime={new Date(n.createdAt * 1000).toISOString()}
                >{formatTime(n.createdAt)}</time
              >
            </div>
          </div>
        </li>
      {/each}
    </ul>
    {#if hasMore}
      {@const busy = notificationsStore.loadingMore}
      <div class="flex justify-center py-6">
        <button
          onclick={showMore}
          disabled={busy}
          aria-busy={busy}
          class="rounded border border-neutral-200 px-6 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {busy ? "Loading…" : "Show more"}
        </button>
      </div>
    {/if}
  {/if}
</section>
