<script lang="ts">
  import { page } from "$app/state";
  import { MODE } from "$lib/config";
  import { getGroupName } from "$lib/group.svelte";
  import {
    profileStore,
    ensureProfile,
    entryFromUser,
    type ProfileEntry,
  } from "$lib/profiles.svelte";
  import {
    userPostsStore,
    loadUserPosts,
    loadMoreUserPosts,
  } from "$lib/userPosts.svelte";
  import type {
    UserPost,
    UserPostKind,
    UserPostPage,
  } from "$lib/forum/userPosts";
  import Meta from "$lib/components/Meta.svelte";
  import { summarize } from "$lib/seo";

  const pubkey = $derived<string | null>(page.data.pubkey ?? null);

  $effect(() => {
    if (!pubkey) return;
    ensureProfile(pubkey);
    loadUserPosts(pubkey);
  });

  // Server-rendered profile, used until the live one is fetched.
  const entry = $derived.by<ProfileEntry | undefined>(() => {
    if (!pubkey) return undefined;
    const live = profileStore.profiles.get(pubkey);
    if (live) return live;
    const u = page.data.profiles?.[pubkey];
    return u ? entryFromUser(u) : undefined;
  });

  const posts = $derived(
    pubkey && userPostsStore.pubkey === pubkey
      ? userPostsStore.posts
      : (page.data.posts ?? null),
  );

  const npub = $derived(entry?.npub ?? page.params.id ?? "");
  const name = $derived(
    entry?.displayName || entry?.name || `${npub.slice(0, 12)}…`,
  );
  const initial = $derived(name[0]?.toUpperCase() ?? "?");

  function websiteHref(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

  function websiteLabel(url: string): string {
    return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function postHref(p: UserPost): string {
    return p.id === p.threadId
      ? `/thread/${p.threadId}`
      : `/thread/${p.threadId}#post-${p.id}`;
  }

  const jsonLd = $derived(
    pubkey
      ? {
          "@context": "https://schema.org",
          "@type": "Person",
          name,
          url: page.url.origin + page.url.pathname,
          ...(entry?.picture ? { image: entry.picture } : {}),
          ...(entry?.about ? { description: summarize(entry.about, 160) } : {}),
        }
      : undefined,
  );
</script>

<Meta
  title={name}
  description={entry?.about ? summarize(entry.about, 160) : ""}
  image={entry?.picture}
  {jsonLd}
/>

{#snippet postList(kind: UserPostKind, list: UserPostPage, empty: string)}
  {#if list.items.length === 0}
    <p class="py-3 text-sm text-neutral-400 dark:text-neutral-500">{empty}</p>
  {:else}
    <ul class="divide-y divide-neutral-100 dark:divide-neutral-800">
      {#each list.items as p (p.id)}
        {@const text = summarize(p.content, 200)}
        <li class="py-3">
          <a href={postHref(p)} class="group block">
            {#if p.title}
              <p
                class="group-hover:text-accent line-clamp-2 text-lg leading-5 text-neutral-900 dark:text-neutral-100"
              >
                {p.title}
              </p>
            {/if}
            {#if text}
              <p
                class="mt-1 text-sm leading-5 text-neutral-600 dark:text-neutral-400"
              >
                {text}
              </p>
            {/if}
          </a>
          <div
            class="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-400 dark:text-neutral-500"
          >
            {#if MODE === "full"}
              <a href="/room/{p.groupId}" class="hover:text-accent truncate"
                >{getGroupName(p.groupId)}</a
              >
              <span aria-hidden="true">·</span>
            {/if}
            <time datetime={new Date(p.createdAt * 1000).toISOString()}
              >{formatDate(p.createdAt)}</time
            >
          </div>
        </li>
      {/each}
    </ul>
    {#if !list.done}
      {@const busy = userPostsStore.loadingMore[kind]}
      <div class="flex justify-center py-6">
        <button
          onclick={() => loadMoreUserPosts(kind)}
          disabled={busy}
          aria-busy={busy}
          class="rounded border border-neutral-200 px-6 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          {busy ? "Loading…" : "Show more"}
        </button>
      </div>
    {/if}
  {/if}
{/snippet}

<div class="mx-auto max-w-6xl">
  {#if !pubkey}
    <h1 class="text-accent py-2 text-[1.65rem]">Profile</h1>
    <p class="py-12 text-center text-neutral-400 dark:text-neutral-500">
      Profile not found.
    </p>
  {:else}
    <h1 class="text-accent py-2 text-[1.65rem]">{name}</h1>

    <div class="mt-2 flex items-start gap-6">
      <div class="min-w-0 flex-1">
        {#if entry?.nip05}
          <p class="truncate text-neutral-400 dark:text-neutral-500">
            {entry.nip05}
          </p>
        {/if}

        {#if entry?.about}
          <p
            class="mt-2 whitespace-pre-line text-neutral-600 dark:text-neutral-400"
          >
            {entry.about}
          </p>
        {/if}

        <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
          {#if entry?.website}
            <a
              href={websiteHref(entry.website)}
              target="_blank"
              rel="noopener noreferrer"
              class="text-accent truncate hover:underline"
            >
              {websiteLabel(entry.website)}
            </a>
          {/if}
          {#if entry?.lud16}
            <span
              class="text-neutral-500 dark:text-neutral-400"
              title="Lightning address"
            >
              ⚡ {entry.lud16}
            </span>
          {/if}
          <a
            href="https://njump.me/{npub}"
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent text-sm hover:underline"
          >
            View on njump ↗
          </a>
        </div>
      </div>

      {#if entry?.picture}
        <img
          src={entry.picture}
          alt=""
          class="h-24 w-24 shrink-0 rounded-full object-cover sm:h-32 sm:w-32"
        />
      {:else}
        <span
          class="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-3xl font-semibold text-neutral-500 sm:h-32 sm:w-32 dark:bg-neutral-700 dark:text-neutral-400"
          aria-hidden="true"
        >
          {initial}
        </span>
      {/if}
    </div>

    <div class="mt-10 grid gap-10 md:grid-cols-2 md:gap-8">
      <section aria-labelledby="profile-discussions">
        <h2
          id="profile-discussions"
          class="text-accent border-b border-neutral-100 pb-2 text-[1.5rem] leading-7 dark:border-neutral-800"
        >
          Discussions
        </h2>
        {#if !posts}
          <p class="py-3 text-sm text-neutral-400 dark:text-neutral-500">
            Loading…
          </p>
        {:else}
          {@render postList("roots", posts.roots, "No discussions yet.")}
        {/if}
      </section>

      <section aria-labelledby="profile-replies">
        <h2
          id="profile-replies"
          class="text-accent border-b border-neutral-100 pb-2 text-[1.5rem] leading-7 dark:border-neutral-800"
        >
          Replies
        </h2>
        {#if !posts}
          <p class="py-3 text-sm text-neutral-400 dark:text-neutral-500">
            Loading…
          </p>
        {:else}
          {@render postList("replies", posts.replies, "No replies yet.")}
        {/if}
      </section>
    </div>
  {/if}
</div>
