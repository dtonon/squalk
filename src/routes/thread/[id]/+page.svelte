<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { threadDetailStore, loadThread, type PostData } from "$lib/thread.svelte";
  import Reactions from "$lib/components/Reactions.svelte";
  import ThreadScrubber from "$lib/components/ThreadScrubber.svelte";
  import type { NostrUser } from "@nostr/gadgets/metadata";

  type Author = { pubkey: string; name: string; picture?: string };

  function resolveAuthor(pubkey: string, profiles: Record<string, NostrUser>): Author {
    const user = profiles[pubkey];
    return {
      pubkey,
      name: user?.shortName ?? pubkey.slice(0, 8),
      picture: user?.metadata.picture,
    };
  }

  function formatDate(ts: number) {
    return new Date(ts * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  let opEl = $state<HTMLElement | null>(null);
  let replyEls = $state<(HTMLElement | null)[]>([]);
  let isScrolled = $state(false);
  let opTopOffset = $state(0);

  const detail = $derived(threadDetailStore.detail);
  const profiles = $derived(threadDetailStore.profiles);

  const allPosts = $derived(
    detail ? [detail.op, ...detail.replies] : []
  );
  const postEls = $derived([opEl, ...replyEls]);

  // Reload when navigating between threads
  $effect(() => {
    if (page.params.id) loadThread(page.params.id);
  });

  onMount(() => {
    const main = document.querySelector("main");
    if (!main) return;
    main.classList.add("no-scrollbar");
    const onScroll = () => { isScrolled = main.scrollTop > 0; };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.classList.remove("no-scrollbar");
      main.removeEventListener("scroll", onScroll);
    };
  });

  $effect(() => {
    if (!opEl) return;
    const main = document.querySelector("main");
    if (!main) return;
    opTopOffset =
      opEl.getBoundingClientRect().top - main.getBoundingClientRect().top;
  });
</script>

<svelte:head>
  <title>{detail?.title ?? "Thread"}</title>
</svelte:head>

{#snippet avatar(author: Author)}
  {#if author.picture}
    <img src={author.picture} alt="" class="w-12 h-12 rounded-full object-cover" />
  {:else}
    <span class="w-12 h-12 flex items-center justify-center rounded-full bg-gray-200 text-lg font-semibold text-gray-500">
      {author.name[0].toUpperCase()}
    </span>
  {/if}
{/snippet}

{#snippet post(p: PostData, bindEl: (el: HTMLElement | null) => void)}
  {@const author = resolveAuthor(p.pubkey, profiles)}
  <div use:bindEl class="flex gap-6 items-start">
    <div class="flex-shrink-0">
      {@render avatar(author)}
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-baseline justify-between mb-2">
        <span class="font-medium text-gray-600">{author.name}</span>
        <span class="text-sm text-gray-400 ml-4 flex-shrink-0">{formatDate(p.createdAt)}</span>
      </div>
      <div class="prose leading-5 max-w-none text-gray-700">
        {#each p.content.split("\n\n") as para}
          <p>{para}</p>
        {/each}
      </div>
      <div class="flex items-center justify-between mt-3">
        <Reactions reactions={[]} zaps={0} />
        <div class="flex items-center gap-4 text-sm text-gray-400 flex-shrink-0">
          <button class="hover:text-brand transition-colors">Quote</button>
          <button class="hover:text-brand transition-colors">React</button>
          <button class="hover:text-amber-500 transition-colors">⚡ Zap</button>
        </div>
      </div>
    </div>
  </div>
{/snippet}

{#if detail}
  <div class="flex gap-6 items-start">
    <div class="flex-1 min-w-0">
      <div class="sticky -top-6 bg-white z-10 pb-4 -mx-10 px-10 pt-6 -mt-6 relative">
        <h1 class="text-[1.65rem] text-brand leading-7">{detail.title}</h1>
        <div
          class="absolute left-0 right-0 h-8 pointer-events-none transition-opacity duration-200"
          style="top: 100%; opacity: {isScrolled ? 1 : 0}; background: linear-gradient(to bottom, white, transparent);"
        ></div>
      </div>

      <div class="pt-6 pb-6 border-b border-gray-100" bind:this={opEl}>
        {@render post(detail.op, () => {})}
      </div>

      {#if detail.replies.length > 0}
        <div class="divide-y divide-gray-100">
          {#each detail.replies as reply, i}
            <div class="py-6" bind:this={replyEls[i]}>
              {@render post(reply, () => {})}
            </div>
          {/each}
        </div>
      {/if}

      <div class="mt-8 border-t border-gray-200 pt-6">
        <textarea
          rows="4"
          placeholder="Write a reply..."
          class="w-full rounded border border-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand"
        ></textarea>
        <div class="mt-2 flex justify-end">
          <button class="rounded bg-brand px-6 py-1.5 font-medium text-white hover:bg-brand-hover">
            Reply
          </button>
        </div>
      </div>
    </div>

    <ThreadScrubber posts={allPosts} {postEls} topOffset={opTopOffset} />
  </div>
{:else}
  <div class="py-12 text-center text-gray-400">Loading…</div>
{/if}
