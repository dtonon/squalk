<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import * as nip19 from "@nostr/tools/nip19";
  import {
    threadDetailStore,
    loadThread,
    sendReply,
    removeReply,
    type PostData,
  } from "$lib/thread.svelte";
  import { auth, openLogin } from "$lib/auth.svelte";
  import { isGroupAdmin } from "$lib/admins.svelte";
  import { requestDelete } from "$lib/moderation.svelte";
  import { showToast } from "$lib/toast.svelte";
  import { withJoin } from "$lib/join.svelte";
  import { setActiveGroup } from "$lib/active.svelte";
  import { RELAY_URL, MODE } from "$lib/config";
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
    const sep =
      replyContent.length > 0 && !replyContent.endsWith("\n\n")
        ? replyContent.endsWith("\n")
          ? "\n"
          : "\n\n"
        : "";
    replyContent = replyContent + sep + block + "\n\n";
    await tick();
    editorEl?.focus({ caretAtEnd: true });
  }

  async function submitReply() {
    if (!auth.user || !replyContent.trim()) return;
    const content = replyContent.trim();
    const pubkey = auth.user.pubkey;
    if (!detail) return;
    replying = true;
    replyError = null;
    try {
      await withJoin(detail.groupId, async () => {
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

  const canModerate = $derived(
    !!auth.user && !!detail && isGroupAdmin(auth.user.pubkey, detail.groupId),
  );

  let openMenuId = $state<string | null>(null);

  function toggleMenu(id: string, e: MouseEvent) {
    e.stopPropagation();
    openMenuId = openMenuId === id ? null : id;
  }

  // Deleting the OP removes the whole thread, so leave the page; a reply just
  // disappears in place.
  function requestDeletePost(p: PostData, isOp: boolean) {
    if (!detail) return;
    const groupId = detail.groupId;
    openMenuId = null;
    requestDelete(
      { eventId: p.id, groupId, label: isOp ? "discussion" : "reply" },
      () => {
        if (isOp) {
          showToast("Discussion deleted");
          goto(MODE === "full" ? `/room/${groupId}` : "/");
        } else {
          removeReply(p.id);
        }
      },
    );
  }

  $effect(() => {
    if (!openMenuId) return;
    const close = () => (openMenuId = null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") openMenuId = null;
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  });

  const allPosts = $derived(detail ? [detail.op, ...detail.replies] : []);
  const postEls = $derived([opEl, ...replyEls]);
  const threadEventAuthors = $derived(
    Object.fromEntries(allPosts.map((p) => [p.id, p.pubkey])),
  );

  // Reload when navigating between threads
  $effect(() => {
    if (page.params.id) loadThread(page.params.id);
  });

  // A thread belongs to its own group; make that the active group so chat and
  // replies target the right room.
  $effect(() => {
    if (detail?.groupId) setActiveGroup(detail.groupId);
  });

  onMount(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const onScroll = () => {
      isScrolled = main.scrollTop > 0;
      if (selectionTarget) selectionTarget = null;
    };
    main.addEventListener("scroll", onScroll, { passive: true });

    // On mobile the document scrolls (not main), so clear the quote popup on
    // window scroll too.
    const onWinScroll = () => {
      if (selectionTarget) selectionTarget = null;
    };
    window.addEventListener("scroll", onWinScroll, { passive: true });

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
      main.removeEventListener("scroll", onScroll);
      window.removeEventListener("scroll", onWinScroll);
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
      class="h-12 w-12 rounded-full object-cover"
    />
  {:else}
    <span
      class="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-200 text-lg font-semibold text-neutral-500"
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
  <div use:bindEl class="md:flex md:items-start md:gap-6">
    <div class="hidden flex-shrink-0 md:block">
      {@render avatar(author)}
    </div>
    <div class="min-w-0 flex-1">
      <div
        class="mb-4 flex items-center justify-between md:mb-3 md:items-baseline"
      >
        <div class="flex min-w-0 items-center gap-3">
          <div class="flex-shrink-0 md:hidden">
            {@render avatar(author)}
          </div>
          <span class="truncate font-medium text-neutral-500"
            >{author.name}</span
          >
        </div>
        <div class="ml-4 flex flex-shrink-0 items-center gap-1">
          {#if canModerate}
            <div class="relative">
              <button
                onclick={(e) => toggleMenu(p.id, e)}
                class="flex items-center justify-center rounded p-1 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-500"
                aria-label="Post actions"
                aria-haspopup="menu"
                aria-expanded={openMenuId === p.id}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-4 w-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"
                  />
                </svg>
              </button>
              {#if openMenuId === p.id}
                <div
                  role="menu"
                  class="absolute top-7 right-0 z-20 w-36 rounded-lg border border-neutral-100 bg-white py-1 text-sm shadow-lg"
                >
                  <button
                    role="menuitem"
                    onclick={(e) => {
                      e.stopPropagation();
                      requestDeletePost(p, index === 0);
                    }}
                    class="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50"
                    >Delete</button
                  >
                </div>
              {/if}
            </div>
          {/if}
          <span class="text-sm text-neutral-400">{formatDate(p.createdAt)}</span
          >
        </div>
      </div>
      <div data-quote-post-index={index} id="post-{p.id}" class="scroll-mt-32">
        <PostContent content={p.content} {profiles} {threadEventAuthors} />
      </div>
      {#if auth.user}
        <div class="mt-6 flex items-center justify-start">
          <button
            onclick={() => quotePost(p)}
            disabled={!auth.user}
            class="hover:text-brand flex cursor-pointer items-center gap-1.5 text-neutral-300 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span>Quote post</span>
            <svg
              class="w-3"
              viewBox="0 0 800 800"
              version="1.1"
              xmlns="http://www.w3.org/2000/svg"
              xmlns:xlink="http://www.w3.org/1999/xlink"
              xml:space="preserve"
              style="fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round;"
              ><path
                d="M101.286,748.313l199.143,0c109.981,0 199.142,-89.161 199.142,-199.142l0,-497.856m0,-0l199.143,199.142m-199.143,-199.142l-199.142,199.142"
                style="fill:none;fill-rule:nonzero;stroke:currentColor;stroke-width:99.57px;"
              /></svg
            >
          </button>
        </div>
      {/if}
    </div>
  </div>
{/snippet}

{#if detail}
  <div class="flex items-start gap-6">
    <div class="min-w-0 flex-1 {!scrubberVisible ? 'md:pr-18' : ''}">
      <div
        class="relative z-10 bg-white pb-1 md:sticky md:-top-6 md:-mx-10 md:-mt-6 md:px-10 md:pt-6"
      >
        <a
          href={MODE === "full" ? `/room/${detail.groupId}` : "/"}
          class="hover:text-brand mb-1 inline-flex items-center gap-1 text-sm text-neutral-400"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            stroke-width="1.8"
            aria-hidden="true"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15.75 19.5 8.25 12l7.5-7.5"
            />
          </svg>
          Discussions
        </a>
        <h1 class="text-brand text-[1.65rem] leading-7">{detail.title}</h1>
        {#if isScrolled}
          <div
            class="pointer-events-none absolute right-0 left-0 h-8 transition-opacity duration-200"
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
        <div class="divide-y divide-neutral-100 border-t border-neutral-100">
          {#each detail.replies as reply, i}
            <div class="py-6" bind:this={replyEls[i]}>
              {@render post(reply, i + 1, () => {})}
            </div>
          {/each}
        </div>
      {/if}

      <div class="mt-8 border-t border-neutral-200 pt-6 md:pl-18">
        {#if auth.user}
          {#if replyError}
            <div
              class="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {replyError}
            </div>
          {/if}
          <MessageEditor
            bind:this={editorEl}
            bind:value={replyContent}
            disabled={replying}
            rows={8}
            minHeightClass="min-h-[12rem]"
            placeholder="Write a reply..."
            contextPubkeys={allPosts.map((p) => p.pubkey)}
            {threadEventAuthors}
          />
          <div class="mt-4 flex justify-end">
            <button
              onclick={submitReply}
              disabled={replying || !replyContent.trim()}
              class="bg-brand hover:bg-brand-hover rounded px-6 py-1.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {replying ? "Posting…" : "post reply"}
            </button>
          </div>
        {:else}
          <p class=" text-center text-neutral-500">
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
  <div class="py-12 text-center text-neutral-400">Loading…</div>
{/if}

{#if selectionTarget && auth.user}
  <button
    type="button"
    onmousedown={(e) => e.preventDefault()}
    onclick={quoteFromSelection}
    style="top: {selectionTarget.top}px; left: {selectionTarget.left}px;"
    class="fixed z-50 -translate-x-1/2 -translate-y-full rounded bg-neutral-900 px-3 py-1 text-xs font-medium text-white shadow-md hover:bg-neutral-700"
  >
    Quote
  </button>
{/if}
