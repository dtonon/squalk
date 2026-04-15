<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import {
    threadDetailStore,
    loadThread,
    sendReply,
    type PostData,
  } from "$lib/thread.svelte";
  import { auth, openLogin } from "$lib/auth.svelte";
  import { withJoin } from "$lib/join.svelte";
  import Reactions from "$lib/components/Reactions.svelte";
  import ThreadScrubber from "$lib/components/ThreadScrubber.svelte";
  import MessageEditor from "$lib/components/MessageEditor.svelte";
  import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";
  import * as nip19 from "@nostr/tools/nip19";

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

  // Curated TLD list: gTLDs, popular new gTLDs, common ccTLDs
  const TLDS = [
    "com","org","net","edu","gov","mil","int","info","biz","name","pro",
    "io","co","app","dev","ai","sh","me","ly","tv","fm","lol","club",
    "online","site","store","blog","tech","xyz","art","design","news",
    "media","page","link","fun","gg","gl","st","to","run","life","world",
    "space","cloud","email","social","chat","wtf","cafe","zone","studio",
    "us","uk","de","fr","it","es","nl","ru","jp","cn","ca","au","br","in",
    "mx","se","no","fi","dk","ch","at","be","pl","pt","gr","cz","ie","nz",
    "kr","sg","hk","tw","za","cc","ws","eu","tr","ua","il","ar","cl","pe",
  ].join("|");

  const URL_RE = new RegExp(
    `nostr:(?:npub1|nprofile1|note1|nevent1|naddr1)[a-z0-9]+|https?:\\/\\/[^\\s<>"']+|(?<![\\w@.\\/])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})\\b(?:[\\/?#][^\\s<>"']*)?`,
    "gi",
  );
  const IMG_EXT_RE = /\.(?:jpg|jpeg|png|gif|webp|avif|svg|bmp)(?:\?.*)?$/i;
  // Trailing punctuation that is usually not part of the URL
  const TRAILING_PUNCT_RE = /[).,;:!?'"]+$/;

  function shortEntity(entity: string): string {
    const m = entity.match(/^(npub|nprofile|note|nevent|naddr)1/);
    if (!m) return entity;
    const prefix = m[0];
    const rest = entity.slice(prefix.length);
    if (rest.length <= 12) return entity;
    return `${prefix}${rest.slice(0, 6)}…${rest.slice(-4)}`;
  }

  type Inline =
    | { type: "text"; value: string }
    | { type: "link"; href: string; label: string }
    | { type: "mention"; pubkey: string; entity: string; fallback: string }
    | { type: "entity"; entity: string; label: string };

  type Block =
    | { type: "image"; value: string }
    | { type: "para"; inlines: Inline[] };

  function tokenize(text: string): Block[] {
    const blocks: Block[] = [];
    let inlines: Inline[] = [];
    const flush = () => {
      if (
        inlines.some(
          (i) =>
            i.type === "link" ||
            i.type === "mention" ||
            i.type === "entity" ||
            i.value.trim(),
        )
      )
        blocks.push({ type: "para", inlines });
      inlines = [];
    };
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
      const start = m.index ?? 0;
      let url = m[0];
      const isNostr = /^nostr:/i.test(url);
      let trailing = "";
      if (!isNostr) {
        const trail = url.match(TRAILING_PUNCT_RE);
        if (trail) {
          trailing = trail[0];
          url = url.slice(0, -trailing.length);
        }
      }
      if (start > last)
        inlines.push({ type: "text", value: text.slice(last, start) });
      if (isNostr) {
        const entity = url.slice(6).toLowerCase();
        let handled = false;
        try {
          const decoded = nip19.decode(entity);
          if (decoded.type === "npub") {
            inlines.push({
              type: "mention",
              pubkey: decoded.data,
              entity,
              fallback: shortEntity(entity),
            });
            handled = true;
          } else if (decoded.type === "nprofile") {
            inlines.push({
              type: "mention",
              pubkey: decoded.data.pubkey,
              entity,
              fallback: shortEntity(entity),
            });
            handled = true;
          } else if (
            decoded.type === "note" ||
            decoded.type === "nevent" ||
            decoded.type === "naddr"
          ) {
            inlines.push({
              type: "entity",
              entity,
              label: shortEntity(entity),
            });
            handled = true;
          }
        } catch {
          // Fall through to text
        }
        if (!handled) inlines.push({ type: "text", value: m[0] });
      } else {
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        if (IMG_EXT_RE.test(url)) {
          flush();
          blocks.push({ type: "image", value: href });
          if (trailing) inlines.push({ type: "text", value: trailing });
        } else {
          inlines.push({ type: "link", href, label: url });
          if (trailing) inlines.push({ type: "text", value: trailing });
        }
      }
      last = start + m[0].length;
    }
    if (last < text.length)
      inlines.push({ type: "text", value: text.slice(last) });
    flush();
    return blocks;
  }

  let opEl = $state<HTMLElement | null>(null);
  let replyEls = $state<(HTMLElement | null)[]>([]);
  let isScrolled = $state(false);
  let replyContent = $state("");
  let replying = $state(false);
  let replyError = $state<string | null>(null);

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

  let resolvedUsers = $state<Record<string, NostrUser>>({});

  $effect(() => {
    if (!detail) return;
    const seen = new Set<string>();
    for (const post of [detail.op, ...detail.replies]) {
      for (const block of tokenize(post.content)) {
        if (block.type !== "para") continue;
        for (const inline of block.inlines) {
          if (inline.type === "mention") seen.add(inline.pubkey);
        }
      }
    }
    for (const pubkey of seen) {
      if (resolvedUsers[pubkey] || profiles[pubkey]) continue;
      loadNostrUser(pubkey).then((u) => {
        resolvedUsers = { ...resolvedUsers, [pubkey]: u };
      });
    }
  });

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
    };
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

{#snippet post(p: PostData, bindEl: (el: HTMLElement | null) => void)}
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
      <div
        class="prose leading-5 max-w-none text-gray-700 [&_p]:my-3 [&_img]:my-3"
      >
        {#each p.content.split(/\n{2,}/) as para}
          {#each tokenize(para) as block}
            {#if block.type === "image"}
              <img
                src={block.value}
                alt=""
                loading="lazy"
                class="block mx-auto w-full max-h-[80vh] object-contain rounded"
              />
            {:else}
              <p>
                {#each block.inlines as inline}
                  {#if inline.type === "link"}
                    <a
                      href={inline.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-brand hover:underline break-all"
                      >{inline.label}</a
                    >
                  {:else if inline.type === "mention"}
                    {@const u =
                      profiles[inline.pubkey] ?? resolvedUsers[inline.pubkey]}
                    <a
                      href="https://njump.me/{inline.entity}"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-brand hover:underline"
                      >@{u?.shortName ?? inline.fallback}</a
                    >
                  {:else if inline.type === "entity"}
                    <a
                      href="https://njump.me/{inline.entity}"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="text-brand hover:underline break-all"
                      >{inline.label}</a
                    >
                  {:else}{inline.value}{/if}
                {/each}
              </p>
            {/if}
          {/each}
        {/each}
      </div>
      <div class="flex items-center justify-between mt-3">
        <Reactions reactions={[]} zaps={0} />
        <div
          class="flex items-center gap-4 text-sm text-gray-400 flex-shrink-0"
        >
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
    <div class="flex-1 min-w-0" class:pr-18={!scrubberVisible}>
      <div
        class="sticky -top-6 bg-white z-10 pb-4 -mx-10 px-10 pt-6 -mt-6 relative"
      >
        <h1 class="text-[1.65rem] text-brand leading-7">{detail.title}</h1>
        <div
          class="absolute left-0 right-0 h-8 pointer-events-none transition-opacity duration-200"
          style="top: 100%; opacity: {isScrolled
            ? 1
            : 0}; background: linear-gradient(to bottom, white, transparent);"
        ></div>
      </div>

      <div class="pt-6 pb-6" bind:this={opEl}>
        {@render post(detail.op, () => {})}
      </div>

      {#if detail.replies.length > 0}
        <div class="divide-y divide-gray-100 border-t border-gray-100">
          {#each detail.replies as reply, i}
            <div class="py-6" bind:this={replyEls[i]}>
              {@render post(reply, () => {})}
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
            bind:value={replyContent}
            disabled={replying}
            rows={4}
            placeholder="Write a reply..."
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
