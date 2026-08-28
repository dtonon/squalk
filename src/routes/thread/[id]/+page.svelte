<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { afterNavigate, goto } from "$app/navigation";
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
  import {
    requestDelete,
    withinSelfDeleteWindow,
  } from "$lib/moderation.svelte";
  import { showToast } from "$lib/toast.svelte";
  import {
    withJoin,
    joinState,
    membershipOf,
    ensureMembershipChecked,
  } from "$lib/join.svelte";
  import { setActiveGroup } from "$lib/active.svelte";
  import { applyHighlights, clearHighlights } from "$lib/pageHighlight";
  import { RELAY_URL, MODE } from "$lib/config";
  import { profilePath } from "$lib/forum/profiles";
  import ThreadScrubber from "$lib/components/ThreadScrubber.svelte";
  import MessageEditor from "$lib/components/MessageEditor.svelte";
  import PostContent from "$lib/components/PostContent.svelte";
  import Tag from "$lib/components/Tag.svelte";
  import Meta from "$lib/components/Meta.svelte";
  import { excerpt } from "$lib/seo";
  import type { NostrUser } from "$lib/gadgets";

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

  // Structured data for crawlers: the OP as a forum posting.
  const jsonLd = $derived(
    detail
      ? {
          "@context": "https://schema.org",
          "@type": "DiscussionForumPosting",
          headline: detail.title,
          text: detail.op.content,
          url: page.url.origin + page.url.pathname,
          datePublished: new Date(detail.op.createdAt * 1000).toISOString(),
          author: {
            "@type": "Person",
            name: resolveAuthor(detail.op.pubkey, profiles).name,
          },
          commentCount: detail.replies.length,
        }
      : undefined,
  );

  // Replying needs membership regardless of flags. Only gate a confirmed guest;
  // while membership resolves the editor stays and submit awaits the check, so a
  // member never flashes "Join to reply".
  const joinToReply = $derived(
    !!detail && !!auth.user && membershipOf(detail.groupId) === "guest",
  );

  // The relay requires membership to reply, so resolve it up front. Depends on
  // auth.user so a silent session restore re-runs the check.
  $effect(() => {
    auth.user;
    if (detail?.groupId) ensureMembershipChecked(detail.groupId);
  });

  function onJoinToReply() {
    if (!detail) return;
    withJoin(detail.groupId, async () => {
      await tick();
      editorEl?.focus();
    });
  }

  const canModerate = $derived(
    !!auth.user && !!detail && isGroupAdmin(auth.user.pubkey, detail.groupId),
  );

  const isOwnPost = (p: PostData) => auth.user?.pubkey === p.pubkey;

  // Whose delete a post can offer: admins moderate anything; authors self-delete
  // their own (the button still shows when too old, just disabled).
  const canDeletePost = (p: PostData) => canModerate || isOwnPost(p);

  let openMenuId = $state<string | null>(null);

  function toggleMenu(id: string, e: MouseEvent) {
    e.stopPropagation();
    openMenuId = openMenuId === id ? null : id;
  }

  // Deleting the OP removes the whole thread, so leave the page; a reply just
  // disappears in place. Admins moderate (kind 9005); authors self-delete
  // (kind 5) only inside the time window.
  function requestDeletePost(p: PostData, isOp: boolean) {
    if (!detail) return;
    const groupId = detail.groupId;
    const self = !canModerate;
    openMenuId = null;
    requestDelete(
      {
        eventId: p.id,
        groupId,
        label: isOp ? "discussion" : "reply",
        self,
        eventKind: isOp ? 11 : 1111,
      },
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

  // The OP shares the thread URL, a reply its anchored URL.
  async function shareLink(p: PostData, isOp: boolean) {
    if (!detail) return;
    openMenuId = null;
    const url =
      page.url.origin + `/thread/${detail.id}` + (isOp ? "" : `#post-${p.id}`);
    try {
      await navigator.clipboard.writeText(url);
      showToast("Link copied");
    } catch {
      showToast("Could not copy the link");
    }
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

  // Arriving from search (?q=…): paint the terms over the title and post
  // bodies, and scroll to the first match once per navigation. Re-runs as
  // replies stream in so late matches get painted too.
  let threadEl = $state<HTMLElement | null>(null);
  let scrolledFor = "";
  $effect(() => {
    const q = page.url.searchParams.get("q")?.trim() ?? "";
    allPosts; // Repaint when posts load or change
    if (!threadEl || !q) {
      clearHighlights();
      return;
    }
    const roots = threadEl.querySelectorAll("h1, [data-quote-post-index]");
    const first = applyHighlights(roots, q);
    const key = `${page.params.id}|${q}`;
    if (first && scrolledFor !== key) {
      scrolledFor = key;
      first.startContainer.parentElement?.scrollIntoView({ block: "center" });
    }
    return clearHighlights;
  });

  // Arriving with a #post-… hash (a reply link): scroll to the post once per
  // navigation. It may only exist once the replies have loaded, so re-check as
  // they stream in; on a direct load it is already there and SvelteKit's own
  // deep-link scroll runs after ours, so afterNavigate applies ours again.
  let scrolledHashFor = "";
  function scrollToHash(force = false) {
    const hash = page.url.hash;
    if (!threadEl || !hash.startsWith("#post-")) return;
    const key = `${page.params.id}|${hash}`;
    if (!force && scrolledHashFor === key) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    scrolledHashFor = key;
    scrollToPost(el);
  }
  $effect(() => {
    allPosts;
    scrollToHash();
  });
  afterNavigate(() => scrollToHash(true));

  // On desktop the thread scrolls inside <main> under a sticky title with a
  // fade below it, so place the post under both; elsewhere the scroll margin
  // is enough.
  const HEADER_FADE = 32; // the h-8 gradient
  const HEADER_GAP = 12;
  function scrollToPost(el: HTMLElement) {
    const main = document.querySelector("main");
    const header = threadEl?.querySelector("[data-thread-header]");
    if (!main || !header || !window.matchMedia("(min-width: 768px)").matches) {
      el.scrollIntoView({ block: "start" });
      return;
    }
    const headerBottom =
      main.getBoundingClientRect().top + header.getBoundingClientRect().height;
    const offset = headerBottom + HEADER_FADE + HEADER_GAP;
    main.scrollTop += el.getBoundingClientRect().top - offset;
  }

  // In-thread quote links ("… said") get the same placement instead of the
  // browser's default anchor jump.
  $effect(() => {
    const root = threadEl;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest("a[href^='#post-']");
      if (!a) return;
      const hash = a.getAttribute("href") ?? "";
      const el = document.getElementById(hash.slice(1));
      if (!el) return;
      e.preventDefault();
      scrolledHashFor = `${page.params.id}|${hash}`;
      goto(hash, { noScroll: true });
      scrollToPost(el);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
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

  // The scrubber sticks where the OP starts. Measure independently of the
  // current scroll (the page may mount already scrolled, e.g. arriving from a
  // profile with a reply link) and again when the header changes height.
  $effect(() => {
    const el = opEl;
    const header = threadEl?.querySelector("[data-thread-header]");
    if (!el || !header) return;
    const main = document.querySelector("main");
    if (!main) return;
    const measure = () => {
      opTopOffset =
        el.getBoundingClientRect().top -
        main.getBoundingClientRect().top +
        main.scrollTop;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(header);
    return () => ro.disconnect();
  });
</script>

<Meta
  title={detail?.title ?? "Thread"}
  description={detail ? excerpt(detail.op.content) : ""}
  type="article"
  {jsonLd}
/>

{#snippet avatar(author: Author)}
  {#if author.picture}
    <img
      src={author.picture}
      alt=""
      class="h-12 w-12 rounded-full object-cover"
    />
  {:else}
    <span
      class="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-200 text-lg font-semibold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
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
    <a
      href={profilePath(author.pubkey)}
      class="hidden flex-shrink-0 md:block"
      aria-hidden="true"
      tabindex="-1"
    >
      {@render avatar(author)}
    </a>
    <div class="min-w-0 flex-1">
      <div
        class="mb-4 flex items-center justify-between md:mb-3 md:items-baseline"
      >
        <div class="flex min-w-0 items-center gap-3">
          <a
            href={profilePath(author.pubkey)}
            class="flex-shrink-0 md:hidden"
            aria-hidden="true"
            tabindex="-1"
          >
            {@render avatar(author)}
          </a>
          <a
            href={profilePath(author.pubkey)}
            class="hover:text-accent truncate font-medium text-neutral-500 dark:text-neutral-400"
            >{author.name}</a
          >
        </div>
        <div class="ml-4 flex flex-shrink-0 items-center gap-1">
          <div class="relative">
            <button
              onclick={(e) => toggleMenu(p.id, e)}
              class="flex items-center justify-center rounded p-1 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-500 dark:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-400"
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
                class="absolute top-7 right-0 z-20 w-36 rounded-lg border border-neutral-100 bg-white py-1 text-sm shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
              >
                <button
                  role="menuitem"
                  onclick={(e) => {
                    e.stopPropagation();
                    shareLink(p, index === 0);
                  }}
                  class="w-full px-3 py-1.5 text-left text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >Share link</button
                >
                {#if canDeletePost(p)}
                  {@const tooOld =
                    !canModerate && !withinSelfDeleteWindow(p.createdAt)}
                  <button
                    role="menuitem"
                    disabled={tooOld}
                    onclick={(e) => {
                      e.stopPropagation();
                      requestDeletePost(p, index === 0);
                    }}
                    class="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-neutral-400 disabled:hover:bg-transparent dark:disabled:text-neutral-600"
                    >Delete{tooOld ? " (too old)" : ""}</button
                  >
                {/if}
              </div>
            {/if}
          </div>
          <span class="text-sm text-neutral-400 dark:text-neutral-500"
            >{formatDate(p.createdAt)}</span
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
            class="hover:text-accent flex cursor-pointer items-center gap-1.5 text-neutral-300 transition-colors disabled:cursor-not-allowed disabled:opacity-50 dark:text-neutral-600"
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
  <div class="flex items-start gap-6" bind:this={threadEl}>
    <div class="min-w-0 flex-1 {!scrubberVisible ? 'md:pr-18' : ''}">
      <div
        data-thread-header
        class="relative z-10 bg-white pb-1 md:sticky md:-top-2 md:-mx-10 md:-mt-6 md:px-10 md:pt-6 md:pb-3 dark:bg-neutral-900"
      >
        <a
          href={MODE === "full" ? `/room/${detail.groupId}` : "/"}
          class="hover:text-accent mb-1 inline-flex items-center gap-1 text-sm text-neutral-400 dark:text-neutral-500"
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
        <h1 class="text-accent text-[1.65rem] leading-7">{detail.title}</h1>
        {#if isScrolled}
          <div
            class="pointer-events-none absolute right-0 left-0 h-8 bg-gradient-to-b from-white to-transparent transition-opacity duration-200 dark:from-neutral-900"
            style="top: 100%;"
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
        <div
          class="divide-y divide-neutral-100 border-t border-neutral-100 dark:divide-neutral-800 dark:border-neutral-800"
        >
          {#each detail.replies as reply, i}
            <div class="py-6" bind:this={replyEls[i]}>
              {@render post(reply, i + 1, () => {})}
            </div>
          {/each}
        </div>
      {/if}

      <div
        class="mt-8 border-t border-neutral-200 pt-6 md:pl-18 dark:border-neutral-700"
      >
        {#if auth.user}
          {#if joinToReply}
            <div class="text-center">
              <p class="mb-3 text-neutral-600 dark:text-neutral-400">
                This room is restricted. Join to reply to this discussion.
              </p>
              <button
                onclick={onJoinToReply}
                disabled={joinState.busy}
                class="bg-accent hover:bg-accent-hover rounded px-6 py-1.5 font-medium text-white disabled:opacity-50"
              >
                {joinState.busy ? "Joining…" : "Join to reply"}
              </button>
            </div>
          {:else}
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
                class="bg-accent hover:bg-accent-hover rounded px-6 py-1.5 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {replying ? "Posting…" : "post reply"}
              </button>
            </div>
          {/if}
        {:else}
          <p class=" text-center text-neutral-500 dark:text-neutral-400">
            To participate and reply, please
            <button
              onclick={() => openLogin()}
              class="text-accent hover:underline">login now</button
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
{:else if threadDetailStore.status === "notfound"}
  <div class="mx-auto max-w-md py-16 text-center">
    <h1 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
      This discussion is private or unavailable
    </h1>
    <p class="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
      It may belong to a private room. {auth.user
        ? "You may need to be a member to read it."
        : "Log in as a member to read it."}
    </p>
    {#if !auth.user}
      <button
        onclick={() => openLogin()}
        class="bg-accent hover:bg-accent-hover mt-5 rounded px-6 py-1.5 font-medium text-white"
      >
        Log in
      </button>
    {/if}
  </div>
{:else}
  <div class="py-12 text-center text-neutral-400 dark:text-neutral-500">
    Loading…
  </div>
{/if}

{#if selectionTarget && auth.user}
  <button
    type="button"
    onmousedown={(e) => e.preventDefault()}
    onclick={quoteFromSelection}
    style="top: {selectionTarget.top}px; left: {selectionTarget.left}px;"
    class="bg-accent hover:bg-accent-hover fixed z-50 -translate-x-1/2 -translate-y-full rounded px-3 py-1 text-xs font-medium text-white shadow-md"
  >
    Quote
  </button>
{/if}
