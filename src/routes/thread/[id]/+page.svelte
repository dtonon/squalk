<script lang="ts">
  import { onMount } from "svelte";
  import { threads } from "$lib/mock";
  import Tag from "$lib/components/Tag.svelte";
  import Reactions from "$lib/components/Reactions.svelte";
  import ThreadScrubber from "$lib/components/ThreadScrubber.svelte";
  import { page } from "$app/state";

  const thread = $derived(threads.find((t) => t.id === page.params.id));

  let opEl = $state<HTMLElement | null>(null);
  let replyEls = $state<(HTMLElement | null)[]>([]);

  // Gradient: visible only once the user has scrolled
  let isScrolled = $state(false);

  // Scrubber: top offset = OP's natural distance from main's top border
  let opTopOffset = $state(0);

  const allPosts = $derived(
    thread ? [thread.op, ...(thread.op.replies ?? [])] : [],
  );

  const postEls = $derived([opEl, ...replyEls]);

  onMount(() => {
    const main = document.querySelector("main");
    if (!main) return;
    main.classList.add("no-scrollbar");
    const onScroll = () => {
      isScrolled = main.scrollTop > 0;
    };
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      main.classList.remove("no-scrollbar");
      main.removeEventListener("scroll", onScroll);
    };
  });

  // Measure OP's natural distance from main's border top (once after DOM is ready)
  $effect(() => {
    if (!opEl) return;
    const main = document.querySelector("main");
    if (!main) return;
    opTopOffset =
      opEl.getBoundingClientRect().top - main.getBoundingClientRect().top;
  });

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
</script>

<svelte:head>
  <title>{thread?.title ?? "Thread"}</title>
</svelte:head>

{#if thread}
  <div class="flex gap-6 items-start">
    <!-- Content column -->
    <div class="flex-1 min-w-0">
      <!-- Sticky title: -top-6 anchors to the border edge (past the py-6 padding gap) -->
      <!-- -mt-6 -mx-10 pull the bg flush to main's edges so nothing bleeds through above/sides -->
      <div
        class="sticky -top-6 bg-white z-10 pb-4 -mx-10 px-10 pt-6 -mt-6 relative"
      >
        <h1 class="text-[1.65rem] text-brand leading-7">{thread.title}</h1>
        <!-- Gradient: only visible once scrolling starts -->
        <div
          class="absolute left-0 right-0 h-8 pointer-events-none transition-opacity duration-200"
          style="top: 100%; opacity: {isScrolled
            ? 1
            : 0}; background: linear-gradient(to bottom, white, transparent);"
        ></div>
      </div>

      <!-- Tags: not sticky, scroll away -->
      <div class="flex gap-2 pt-3 pb-6">
        {#each thread.tags as tag}
          <Tag label={tag.label} />
        {/each}
      </div>

      <!-- OP post -->
      <div bind:this={opEl} class="pb-6 border-b border-gray-100">
        <div class="flex gap-6 items-start">
          <div class="flex-shrink-0">
            <img
              src={thread.op.author.picture}
              alt={thread.op.author.name}
              class="w-12 h-12 rounded-full"
            />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-baseline justify-between mb-2">
              <span class="font-semibold text-gray-900"
                >{thread.op.author.name}</span
              >
              <span class="text-sm text-gray-400 ml-4 flex-shrink-0"
                >{formatDate(thread.op.createdAt)}</span
              >
            </div>
            <div class="prose leading-5 max-w-none text-gray-700">
              {#each thread.op.content.split("\n\n") as para}
                <p>{para}</p>
              {/each}
            </div>
            <div class="flex items-center justify-between mt-3">
              <Reactions
                reactions={thread.op.reactions}
                zaps={thread.op.zaps}
              />
              <div
                class="flex items-center gap-4 text-sm text-gray-400 flex-shrink-0"
              >
                <button class="hover:text-brand transition-colors">Quote</button
                >
                <button class="hover:text-brand transition-colors">React</button
                >
                <button class="hover:text-amber-500 transition-colors"
                  >⚡ Zap</button
                >
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Replies -->
      {#if thread.op.replies && thread.op.replies.length > 0}
        <div class="divide-y divide-gray-100">
          {#each thread.op.replies as reply, i}
            <div bind:this={replyEls[i]} class="py-6">
              <div class="flex gap-6 items-start">
                <div class="flex-shrink-0">
                  <img
                    src={reply.author.picture}
                    alt={reply.author.name}
                    class="w-12 h-12 rounded-full"
                  />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="flex items-baseline justify-between mb-2">
                    <span class="font-semibold text-gray-900"
                      >{reply.author.name}</span
                    >
                    <span class="text-sm text-gray-400 ml-4 flex-shrink-0"
                      >{formatDate(reply.createdAt)}</span
                    >
                  </div>
                  <p class="text-gray-700 leading-5">{reply.content}</p>
                  <div class="flex items-center justify-between mt-3">
                    <Reactions reactions={reply.reactions} zaps={reply.zaps} />
                    <div
                      class="flex items-center gap-4 text-sm text-gray-400 flex-shrink-0"
                    >
                      <button class="hover:text-brand transition-colors"
                        >Quote</button
                      >
                      <button class="hover:text-brand transition-colors"
                        >React</button
                      >
                      <button class="hover:text-amber-500 transition-colors"
                        >⚡ Zap</button
                      >
                    </div>
                  </div>
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Reply box -->
      <div class="mt-8 border-t border-gray-200 pt-6">
        <textarea
          rows="4"
          placeholder="Write a reply..."
          class="w-full rounded border border-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand"
        ></textarea>
        <div class="mt-2 flex justify-end">
          <button
            class="rounded bg-brand px-6 py-1.5 font-medium text-white hover:bg-brand-hover"
          >
            Reply
          </button>
        </div>
      </div>
    </div>

    <!-- Timeline scrubber -->
    <ThreadScrubber posts={allPosts} {postEls} topOffset={opTopOffset} />
  </div>
{:else}
  <div class="px-6 py-6 text-gray-500">Thread not found.</div>
{/if}
