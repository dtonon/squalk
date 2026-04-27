<script lang="ts">
  import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";
  import * as nip19 from "@nostr/tools/nip19";

  type Props = {
    content: string;
    profiles?: Record<string, NostrUser>;
    threadEventAuthors?: Record<string, string>;
  };

  let { content, profiles = {}, threadEventAuthors = {} }: Props = $props();

  // Curated TLD list: gTLDs, popular new gTLDs, common ccTLDs
  const TLDS = [
    "com",
    "org",
    "net",
    "edu",
    "gov",
    "mil",
    "int",
    "info",
    "biz",
    "name",
    "pro",
    "io",
    "co",
    "app",
    "dev",
    "ai",
    "sh",
    "me",
    "ly",
    "tv",
    "fm",
    "lol",
    "club",
    "online",
    "site",
    "store",
    "blog",
    "tech",
    "xyz",
    "art",
    "design",
    "news",
    "media",
    "page",
    "link",
    "fun",
    "gg",
    "gl",
    "st",
    "to",
    "run",
    "life",
    "world",
    "space",
    "cloud",
    "email",
    "social",
    "chat",
    "wtf",
    "cafe",
    "zone",
    "studio",
    "us",
    "uk",
    "de",
    "fr",
    "it",
    "es",
    "nl",
    "ru",
    "jp",
    "cn",
    "ca",
    "au",
    "br",
    "in",
    "mx",
    "se",
    "no",
    "fi",
    "dk",
    "ch",
    "at",
    "be",
    "pl",
    "pt",
    "gr",
    "cz",
    "ie",
    "nz",
    "kr",
    "sg",
    "hk",
    "tw",
    "za",
    "cc",
    "ws",
    "eu",
    "tr",
    "ua",
    "il",
    "ar",
    "cl",
    "pe",
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
    | { type: "entity"; entity: string; label: string }
    | { type: "thread-quote"; pubkey: string; eventId: string };

  type Block =
    | { type: "image"; value: string }
    | { type: "para"; inlines: Inline[] }
    | { type: "blockquote"; blocks: Block[] };

  const BLOCKQUOTE_LINE_RE = /^>\s?(.*)$/;

  function decodeNostrInline(entity: string): Inline | null {
    try {
      const decoded = nip19.decode(entity);
      if (decoded.type === "npub") {
        return {
          type: "mention",
          pubkey: decoded.data,
          entity,
          fallback: shortEntity(entity),
        };
      }
      if (decoded.type === "nprofile") {
        return {
          type: "mention",
          pubkey: decoded.data.pubkey,
          entity,
          fallback: shortEntity(entity),
        };
      }
      if (decoded.type === "note") {
        const id = decoded.data;
        const author = threadEventAuthors[id];
        if (author)
          return { type: "thread-quote", pubkey: author, eventId: id };
        return { type: "entity", entity, label: shortEntity(entity) };
      }
      if (decoded.type === "nevent") {
        const id = decoded.data.id;
        const author = threadEventAuthors[id];
        if (author)
          return { type: "thread-quote", pubkey: author, eventId: id };
        return { type: "entity", entity, label: shortEntity(entity) };
      }
      if (decoded.type === "naddr") {
        return { type: "entity", entity, label: shortEntity(entity) };
      }
    } catch {
      // Invalid bech32, fall through
    }
    return null;
  }

  // Inline-only tokenizer: produces inline tokens for a single line of text.
  // Used inside blockquote lines, where images are not supported.
  function tokenizeInline(text: string): Inline[] {
    const inlines: Inline[] = [];
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
        const decoded = decodeNostrInline(entity);
        if (decoded) inlines.push(decoded);
        else inlines.push({ type: "text", value: m[0] });
      } else {
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        inlines.push({ type: "link", href, label: url });
        if (trailing) inlines.push({ type: "text", value: trailing });
      }
      last = start + m[0].length;
    }
    if (last < text.length)
      inlines.push({ type: "text", value: text.slice(last) });
    return inlines;
  }

  function isBlockquoteParagraph(text: string): boolean {
    const lines = text.split("\n");
    let hasQuoteLine = false;
    for (const l of lines) {
      if (l.length === 0) continue;
      if (!BLOCKQUOTE_LINE_RE.test(l)) return false;
      hasQuoteLine = true;
    }
    return hasQuoteLine;
  }

  function tokenizeBlockquote(text: string): Block {
    // Strip the > prefix per line, then route through the same paragraph
    // pipeline so blockquotes get image support, pre-wrap newlines, and
    // consistent paragraph handling.
    const inner = text
      .split("\n")
      .map((l) => {
        const m = l.match(BLOCKQUOTE_LINE_RE);
        return m ? m[1] : l;
      })
      .join("\n");
    const blocks: Block[] = [];
    for (const para of inner.split(/\n{2,}/)) {
      for (const b of tokenize(para)) blocks.push(b);
    }
    return { type: "blockquote", blocks };
  }

  function tokenize(text: string): Block[] {
    if (isBlockquoteParagraph(text)) return [tokenizeBlockquote(text)];
    const blocks: Block[] = [];
    let inlines: Inline[] = [];
    const flush = () => {
      // Trim leading/trailing newlines so block images don't carry an extra
      // visible line break under whitespace-pre-wrap.
      while (inlines.length > 0) {
        const first = inlines[0];
        if (first.type !== "text") break;
        const trimmed = first.value.replace(/^\n+/, "");
        if (trimmed === "") inlines.shift();
        else {
          inlines[0] = { type: "text", value: trimmed };
          break;
        }
      }
      while (inlines.length > 0) {
        const last = inlines[inlines.length - 1];
        if (last.type !== "text") break;
        const trimmed = last.value.replace(/\n+$/, "");
        if (trimmed === "") inlines.pop();
        else {
          inlines[inlines.length - 1] = { type: "text", value: trimmed };
          break;
        }
      }
      if (inlines.some((i) => i.type !== "text" || i.value.trim()))
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
        const decoded = decodeNostrInline(entity);
        if (decoded) inlines.push(decoded);
        else inlines.push({ type: "text", value: m[0] });
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

  const paragraphs = $derived(
    content.split(/\n{2,}/).map((para) => tokenize(para)),
  );

  let resolvedUsers = $state<Record<string, NostrUser>>({});

  $effect(() => {
    const seen = new Set<string>();
    const collect = (inlines: Inline[]) => {
      for (const inline of inlines) {
        if (inline.type === "mention" || inline.type === "thread-quote")
          seen.add(inline.pubkey);
      }
    };
    const visit = (blocks: Block[]) => {
      for (const block of blocks) {
        if (block.type === "para") collect(block.inlines);
        else if (block.type === "blockquote") visit(block.blocks);
      }
    };
    for (const blocks of paragraphs) visit(blocks);
    for (const pubkey of seen) {
      if (resolvedUsers[pubkey] || profiles[pubkey]) continue;
      loadNostrUser(pubkey).then((u) => {
        resolvedUsers = { ...resolvedUsers, [pubkey]: u };
      });
    }
  });
</script>

{#snippet renderInlines(inlines: Inline[])}
  {#each inlines as inline}
    {#if inline.type === "link"}
      <a
        href={inline.href}
        target="_blank"
        rel="noopener noreferrer"
        class="text-brand hover:underline break-all">{inline.label}</a
      >
    {:else if inline.type === "mention"}
      {@const u = profiles[inline.pubkey] ?? resolvedUsers[inline.pubkey]}
      <a
        href="https://njump.me/{inline.entity}"
        target="_blank"
        rel="noopener noreferrer"
        class="text-brand hover:underline">@{u?.shortName ?? inline.fallback}</a
      >
    {:else if inline.type === "thread-quote"}
      {@const u = profiles[inline.pubkey] ?? resolvedUsers[inline.pubkey]}
      <a
        href="#post-{inline.eventId}"
        class="no-underline font-normal leading-4 bg-neutral-100 block -ml-3 pl-3 py-1 hover:bg-neutral-200"
        >{u?.shortName ?? inline.pubkey.slice(0, 8)} said
        <svg
          class="inline w-3 mb-0.5"
          viewBox="0 0 800 800"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          xmlns:xlink="http://www.w3.org/1999/xlink"
          xml:space="preserve"
          style="fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round;"
          ><path
            d="M101.286,748.313l199.143,0c109.981,0 199.142,-89.161 199.142,-199.142l0,-497.856m0,-0l199.143,199.142m-199.143,-199.142l-199.142,199.142"
            style="fill:none;fill-rule:nonzero;stroke:#000;stroke-width:99.57px;"
          /></svg
        >
      </a>
    {:else if inline.type === "entity"}
      <a
        href="https://njump.me/{inline.entity}"
        target="_blank"
        rel="noopener noreferrer"
        class="text-brand hover:underline break-all">{inline.label}</a
      >
    {:else}{inline.value}{/if}
  {/each}
{/snippet}

{#snippet renderBlocks(blocks: Block[])}
  {#each blocks as block}
    {#if block.type === "image"}
      <img
        src={block.value}
        alt=""
        loading="lazy"
        class="block mx-auto w-full max-h-[80vh] object-contain rounded"
      />
    {:else if block.type === "blockquote"}
      <blockquote
        class="my-3 pb-1 mb-0 border-l-3 border-gray-200 pl-3 text-gray-500"
      >
        {@render renderBlocks(block.blocks)}
      </blockquote>
    {:else}
      <p class="whitespace-pre-wrap">{@render renderInlines(block.inlines)}</p>
    {/if}
  {/each}
{/snippet}

<div
  class="prose leading-5 max-w-none text-gray-700 [&_p]:my-3 [&_img]:my-3 [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none"
>
  {#each paragraphs as blocks}
    {@render renderBlocks(blocks)}
  {/each}
</div>
