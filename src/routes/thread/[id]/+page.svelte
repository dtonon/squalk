<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import * as nip19 from "@nostr/tools/nip19";
  import {
    threadDetailStore,
    loadThread,
    sendReply,
    type PostData,
  } from "$lib/thread.svelte";
  import { auth, openLogin } from "$lib/auth.svelte";
  import { withJoin } from "$lib/join.svelte";
  import { RELAY_URL } from "$lib/config";
  import Reactions from "$lib/components/Reactions.svelte";
  import ThreadScrubber from "$lib/components/ThreadScrubber.svelte";
  import MessageEditor from "$lib/components/MessageEditor.svelte";
  import PostContent from "$lib/components/PostContent.svelte";
  import Tag from "$lib/components/Tag.svelte";
  import { type NostrUser } from "@nostr/gadgets/metadata";

  type Author = { pubkey: string; name: string; picture?: string };

  function resolveAuthor(
    pubkey: string,
    profiles: Record<string, NostrUser>,
  ): Author {
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
  let replyContent = $state("");
  let replying = $state(false);
  let replyError = $state<string | null>(null);
  let editorEl = $state<MessageEditor | null>(null);

  let selectionTarget = $state<{
    post: PostData;
    text: string;
    top: number;
    left: number;
  } | null>(null);

  function formatQuoteBlock(text: string, ref: string): string {
    const lines = text.split("\n");
    const prefixed = lines.map((l) => (l.length > 0 ? `> ${l}` : ">"));
    return [`> ${ref}`, ">", ...prefixed].join("\n");
  }

  async function quotePost(post: PostData, selectedText?: string) {
    const nevent = nip19.neventEncode({
      id: post.id,
      author: post.pubkey,
      relays: [RELAY_URL],
    });
    const ref = `nostr:${nevent}`;
    const source = (selectedText ?? post.content).trim();
    if (!source) return;
    const block = formatQuoteBlock(source, ref);
    const sep = replyContent.length > 0 && !replyContent.endsWith("\n\n")
      ? replyContent.endsWith("\n") ? "\n" : "\n\n"
      : "";
    replyContent = replyContent + sep + block + "\n\n";
    await tick();
    editorEl?.focus({ caretAtEnd: true });
  }

  async function submitReply() {
    if (!auth.user || !replyContent.trim()) return;
    const content = replyContent.trim();
    const pubkey = auth.user.pubkey;
    replying = true;
    replyError = null;
    try {
      await withJoin(async () => {
        await sendReply(content, pubkey);
        replyContent = "";
      });
    } catch (e) {
      replyError = e instanceof Error ? e.message : "Failed to post reply";
    } finally {
      replying = false;
    }
  }
  let opTopOffset = $state(0);
  let scrubberVisible = $state(false);

  const detail = $derived(threadDetailStore.detail);
  const profiles = $derived(threadDetailStore.profiles);

  const allPosts = $derived(detail ? [detail.op, ...detail.replies] : []);
  const postEls = $derived([opEl, ...replyEls]);
  const threadEventAuthors = $derived(
    Object.fromEntries(allPosts.map((p) => [p.id, p.pubkey])),
  );

  // Reload when navigating between threads
  $effect(() => {
    if (page.params.id) loadThread(page.params.id);
  });

  onMount(() => {
    const main = document.querySelector("main");
    if (!main) return;
    main.classList.add("no-scrollbar");
    const onScroll = () => {
      isScrolled = main.scrollTop > 0;
      if (selectionTarget) selectionTarget = null;
    };
    main.addEventListener("scroll", onScroll, { passive: true });

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        selectionTarget = null;
        return;
      }
      const range = sel.getRangeAt(0);
      const text = sel.toString().trim();
      if (!text) {
        selectionTarget = null;
        return;
      }
      // Selection must start and end inside the same post's content area.
      const startEl =
        range.startContainer.nodeType === Node.ELEMENT_NODE
          ? (range.startContainer as Element)
          : range.startContainer.parentElement;
      const endEl =
        range.endContainer.nodeType === Node.ELEMENT_NODE
          ? (range.endContainer as Element)
          : range.endContainer.parentElement;
      const startWrap = startEl?.closest("[data-quote-post-index]");
      const endWrap = endEl?.closest("[data-quote-post-index]");
      if (!startWrap || startWrap !== endWrap) {
        selectionTarget = null;
        return;
      }
      const idx = Number(startWrap.getAttribute("data-quote-post-index"));
      const post = allPosts[idx];
      if (!post) {
        selectionTarget = null;
        return;
      }
      const rect = range.getBoundingClientRect();
      selectionTarget = {
        post,
        text,
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
      };
    };
    document.addEventListener("selectionchange", onSelectionChange);

    return () => {
      main.classList.remove("no-scrollbar");
      main.removeEventListener("scroll", onScroll);
      document.removeEventListener("selectionchange", onSelectionChange);
    };
  });

  async function quoteFromSelection() {
    if (!selectionTarget) return;
    const { post, text } = selectionTarget;
    selectionTarget = null;
    window.getSelection()?.removeAllRanges();
    await quotePost(post, text);
  }

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
    <img
      src={author.picture}
      alt=""
      class="w-12 h-12 rounded-full object-cover"
    />
  {:else}
    <span
      class="w-12 h-12 flex items-center justify-center rounded-full bg-gray-200 text-lg font-semibold text-gray-500"
    >
      {author.name[0].toUpperCase()}
    </span>
  {/if}
{/snippet}

{#snippet post(
  p: PostData,
  index: number,
  bindEl: (el: HTMLElement | null) => void,
)}
  {@const author = resolveAuthor(p.pubkey, profiles)}
  <div use:bindEl class="flex gap-6 items-start">
    <div class="flex-shrink-0">
      {@render avatar(author)}
    </div>
    <div class="flex-1 min-w-0">
      <div class="flex items-baseline justify-between mb-2">
        <span class="font-medium text-gray-600">{author.name}</span>
        <span class="text-sm text-gray-400 ml-4 flex-shrink-0"
          >{formatDate(p.createdAt)}</span
        >
      </div>
      <div data-quote-post-index={index} id="post-{p.id}" class="scroll-mt-32">
        <PostContent
          content={p.content}
          {profiles}
          {threadEventAuthors}
        />
      </div>
      <div class="flex items-center justify-between mt-3">
        <Reactions reactions={[]} zaps={0} />
        <div
          class="flex items-center gap-4 text-sm text-gray-400 flex-shrink-0"
        >
          <button
            onclick={() => quotePost(p)}
            disabled={!auth.user}
            class="cursor-pointer hover:text-brand transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >Quote</button
          >
          <button class="hover:text-brand transition-colors">React</button>
          <button class="hover:text-amber-500 transition-colors">⚡ Zap</button>
        </div>
      </div>
    </div>
  </div>
{/snippet}

{#if detail}
  <div class="flex gap-6 items-start">
    <div class="flex-1 min-w-0" class:pr-18={!scrubberVisible}>
      <div
        class="sticky -top-6 bg-white z-10 pb-1 -mx-10 px-10 pt-6 -mt-6 relative"
      >
        <h1 class="text-[1.65rem] text-brand leading-7">{detail.title}</h1>
        {#if isScrolled}
          <div
            class="absolute left-0 right-0 h-8 pointer-events-none transition-opacity duration-200"
            style="top: 100%; background: linear-gradient(to bottom, white, transparent);"
          ></div>
        {/if}
      </div>

      {#if detail.labels.length > 0}
        <div class="mt-1 flex flex-wrap items-center gap-1">
          {#each detail.labels as l}
            <Tag label={l} />
          {/each}
        </div>
      {/if}

      <div class="pt-6 pb-6" bind:this={opEl}>
        {@render post(detail.op, 0, () => {})}
      </div>

      {#if detail.replies.length > 0}
        <div class="divide-y divide-gray-100 border-t border-gray-100">
          {#each detail.replies as reply, i}
            <div class="py-6" bind:this={replyEls[i]}>
              {@render post(reply, i + 1, () => {})}
            </div>
          {/each}
        </div>
      {/if}

      <div class="mt-8 border-t border-gray-200 pt-6 pl-18">
        {#if auth.user}
          {#if replyError}
            <div
              class="mb-4 rounded bg-red-50 px-4 py-3 text-sm text-red-700 border border-red-200"
            >
              {replyError}
            </div>
          {/if}
          <MessageEditor
            bind:this={editorEl}
            bind:value={replyContent}
            disabled={replying}
            rows={4}
            placeholder="Write a reply..."
            contextPubkeys={allPosts.map((p) => p.pubkey)}
            {threadEventAuthors}
          />
          <div class="mt-2 flex justify-end">
            <button
              onclick={submitReply}
              disabled={replying || !replyContent.trim()}
              class="rounded bg-brand px-6 py-1.5 font-medium text-white hover:bg-brand-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {replying ? "Posting…" : "Reply"}
            </button>
          </div>
        {:else}
          <p class=" text-gray-500 text-center">
            To participate and reply, please
            <button onclick={openLogin} class="text-brand hover:underline"
              >login now</button
            >
          </p>
        {/if}
      </div>
    </div>

    <ThreadScrubber
      posts={allPosts}
      {postEls}
      topOffset={opTopOffset}
      bind:visible={scrubberVisible}
    />
  </div>
{:else}
  <div class="py-12 text-center text-gray-400">Loading…</div>
{/if}

{#if selectionTarget && auth.user}
  <button
    type="button"
    onmousedown={(e) => e.preventDefault()}
    onclick={quoteFromSelection}
    style="top: {selectionTarget.top}px; left: {selectionTarget.left}px;"
    class="fixed -translate-x-1/2 -translate-y-full z-50 rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white shadow-md hover:bg-gray-700"
  >
    Quote
  </button>
{/if}
