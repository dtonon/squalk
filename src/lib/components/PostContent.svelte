<script lang="ts">
  import { loadNostrUser, type NostrUser } from "$lib/gadgets";
  import * as nip19 from "@nostr/tools/nip19";
  import {
    resolveThreadRef,
    threadRefHref,
    type ThreadRef,
  } from "$lib/threadRefs";
  import { parse } from "@djot/djot";
  import type {
    Block as DjBlock,
    Inline as DjInline,
    Link as DjLink,
    Image as DjImage,
    Table as DjTable,
    Reference,
  } from "@djot/djot";

  type Props = {
    content: string;
    profiles?: Record<string, NostrUser>;
    threadEventAuthors?: Record<string, string>;
    // Added to each heading level. Thread posts demote by 1 (the post title is
    // a separate h1, so content headings start at h2); standalone articles
    // pass 0 to keep their real levels.
    headingOffset?: number;
  };

  let {
    content,
    profiles = {},
    threadEventAuthors = {},
    headingOffset = 1,
  }: Props = $props();

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
    | { type: "entity"; entity: string; label: string; id?: string }
    | { type: "thread-quote"; pubkey: string; eventId: string }
    | { type: "strong"; children: Inline[] }
    | { type: "em"; children: Inline[] }
    | { type: "del"; children: Inline[] }
    | { type: "code"; value: string }
    | { type: "br" }
    | { type: "image"; src: string; alt: string };

  type Align = "default" | "left" | "right" | "center";
  type TableCell = { align: Align; inlines: Inline[] };
  type TableRow = { head: boolean; cells: TableCell[] };
  type ListItem = { checked: boolean | null; blocks: Block[] };

  type Block =
    | { type: "image"; src: string; alt: string }
    | { type: "para"; inlines: Inline[] }
    | { type: "blockquote"; blocks: Block[] }
    | { type: "heading"; level: number; inlines: Inline[] }
    | { type: "code"; lang: string; value: string }
    | { type: "hr" }
    | {
        type: "list";
        ordered: boolean;
        start: number;
        tight: boolean;
        items: ListItem[];
      }
    | { type: "table"; rows: TableRow[] };

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
        return { type: "entity", entity, label: shortEntity(entity), id };
      }
      if (decoded.type === "nevent") {
        const id = decoded.data.id;
        const author = threadEventAuthors[id];
        if (author)
          return { type: "thread-quote", pubkey: author, eventId: id };
        return { type: "entity", entity, label: shortEntity(entity), id };
      }
      if (decoded.type === "naddr") {
        return { type: "entity", entity, label: shortEntity(entity) };
      }
    } catch {
      // Invalid bech32, fall through
    }
    return null;
  }

  // Leaf text pass: scans a plain-text run (a Djot `str` node) for nostr
  // entities and bare URLs. Never runs on code — verbatim/code_block stay
  // literal.
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

  // Whitelist link schemes: user-controlled hrefs are the one place a raw
  // value reaches an <a>. Anything not http(s)/mailto renders as plain text.
  function safeHref(dest: string): string | null {
    const d = dest.trim();
    if (/^https?:\/\//i.test(d)) return d;
    if (/^mailto:/i.test(d)) return d;
    // Root-relative internal link. The negative lookahead rejects
    // protocol-relative URLs (//host), which the browser treats as external.
    if (/^\/(?!\/)/.test(d)) return d;
    if (/^[a-z][a-z0-9+.-]*:/i.test(d)) return null;
    if (/\S\.\S/.test(d)) return `https://${d}`;
    return null;
  }

  function safeImg(dest: string): string | null {
    const d = dest.trim();
    if (/^https?:\/\//i.test(d)) return d;
    if (/^[a-z][a-z0-9+.-]*:/i.test(d)) return null;
    if (/\S\.\S/.test(d)) return `https://${d}`;
    return null;
  }

  function inlineText(nodes: DjInline[]): string {
    let s = "";
    for (const n of nodes) {
      if ("text" in n && typeof n.text === "string") s += n.text;
      else if ("children" in n) s += inlineText(n.children as DjInline[]);
    }
    return s;
  }

  // Reference-style link/image targets, populated per parse.
  let references: Record<string, Reference> = {};

  function resolveDest(node: DjLink | DjImage): string | undefined {
    if (node.destination !== undefined) return node.destination;
    if (node.reference !== undefined)
      return references[node.reference]?.destination;
    return undefined;
  }

  function convertLink(node: DjLink): Inline {
    const label = inlineText(node.children) || node.destination || "";
    const dest = resolveDest(node);
    if (!dest) return { type: "text", value: label };
    if (/^nostr:/i.test(dest)) {
      const entity = dest.slice(6).toLowerCase();
      try {
        nip19.decode(entity);
        return { type: "link", href: `https://njump.me/${entity}`, label };
      } catch {
        return { type: "text", value: label };
      }
    }
    const href = safeHref(dest);
    if (!href) return { type: "text", value: label };
    return { type: "link", href, label };
  }

  function convertImage(node: DjImage): Inline {
    const alt = inlineText(node.children);
    const dest = resolveDest(node);
    const src = dest ? safeImg(dest) : null;
    if (!src) return { type: "text", value: alt };
    return { type: "image", src, alt };
  }

  function convertInline(node: DjInline): Inline[] {
    switch (node.tag) {
      case "str":
        return tokenizeInline(node.text);
      case "soft_break":
        return [{ type: "text", value: " " }];
      case "hard_break":
        return [{ type: "br" }];
      case "non_breaking_space":
        return [{ type: "text", value: " " }];
      case "verbatim":
        return [{ type: "code", value: node.text }];
      case "strong":
        return [{ type: "strong", children: convertInlines(node.children) }];
      case "emph":
        return [{ type: "em", children: convertInlines(node.children) }];
      case "delete":
        return [{ type: "del", children: convertInlines(node.children) }];
      case "mark":
      case "insert":
      case "span":
      case "superscript":
      case "subscript":
      case "double_quoted":
      case "single_quoted":
        return convertInlines(node.children);
      case "link":
        return [convertLink(node)];
      case "image":
        return [convertImage(node)];
      case "url": {
        const href = safeHref(node.text);
        return href
          ? [{ type: "link", href, label: node.text }]
          : [{ type: "text", value: node.text }];
      }
      case "email":
        return [
          { type: "link", href: `mailto:${node.text}`, label: node.text },
        ];
      case "smart_punctuation":
        return [{ type: "text", value: node.text }];
      case "symb":
        return [{ type: "text", value: `:${node.alias}:` }];
      case "raw_inline":
      case "inline_math":
      case "display_math":
        return [{ type: "text", value: node.text }];
      default:
        return [];
    }
  }

  function convertInlines(nodes: DjInline[]): Inline[] {
    const out: Inline[] = [];
    for (const n of nodes) out.push(...convertInline(n));
    return out;
  }

  // Split an inline run so images (markdown images or bare image URLs)
  // become their own block, matching the standalone-image convention.
  function splitImages(inlines: Inline[]): Block[] {
    const blocks: Block[] = [];
    let cur: Inline[] = [];
    const flush = () => {
      while (cur.length) {
        const f = cur[0];
        if (f.type !== "text") break;
        const t = f.value.replace(/^\s+/, "");
        if (t === "") cur.shift();
        else {
          cur[0] = { type: "text", value: t };
          break;
        }
      }
      while (cur.length) {
        const l = cur[cur.length - 1];
        if (l.type !== "text") break;
        const t = l.value.replace(/\s+$/, "");
        if (t === "") cur.pop();
        else {
          cur[cur.length - 1] = { type: "text", value: t };
          break;
        }
      }
      if (cur.some((i) => i.type !== "text" || i.value.trim()))
        blocks.push({ type: "para", inlines: cur });
      cur = [];
    };
    for (const inl of inlines) {
      if (inl.type === "image") {
        flush();
        blocks.push({ type: "image", src: inl.src, alt: inl.alt });
      } else if (inl.type === "link" && IMG_EXT_RE.test(inl.href)) {
        flush();
        blocks.push({ type: "image", src: inl.href, alt: "" });
      } else cur.push(inl);
    }
    flush();
    return blocks;
  }

  function convertTable(node: DjTable): Block {
    const rows: TableRow[] = [];
    for (const child of node.children) {
      if (child.tag !== "row") continue;
      rows.push({
        head: child.head,
        cells: child.children.map((cell) => ({
          align: cell.align,
          inlines: convertInlines(cell.children),
        })),
      });
    }
    return { type: "table", rows };
  }

  function convertBlock(node: DjBlock): Block[] {
    switch (node.tag) {
      case "para":
        return splitImages(convertInlines(node.children));
      case "heading":
        return [
          {
            type: "heading",
            level: node.level,
            inlines: convertInlines(node.children),
          },
        ];
      case "thematic_break":
        return [{ type: "hr" }];
      case "section":
      case "div":
        return convertBlocks(node.children);
      case "code_block":
        return [
          {
            type: "code",
            lang: node.lang ?? "",
            value: node.text.replace(/\n$/, ""),
          },
        ];
      case "raw_block":
        return [
          { type: "para", inlines: [{ type: "text", value: node.text }] },
        ];
      case "block_quote":
        return [{ type: "blockquote", blocks: convertBlocks(node.children) }];
      case "bullet_list":
        return [
          {
            type: "list",
            ordered: false,
            start: 1,
            tight: node.tight,
            items: node.children.map((li) => ({
              checked: null,
              blocks: convertBlocks(li.children),
            })),
          },
        ];
      case "ordered_list":
        return [
          {
            type: "list",
            ordered: true,
            start: node.start ?? 1,
            tight: node.tight,
            items: node.children.map((li) => ({
              checked: null,
              blocks: convertBlocks(li.children),
            })),
          },
        ];
      case "task_list":
        return [
          {
            type: "list",
            ordered: false,
            start: 1,
            tight: node.tight,
            items: node.children.map((li) => ({
              checked: li.checkbox === "checked",
              blocks: convertBlocks(li.children),
            })),
          },
        ];
      case "table":
        return [convertTable(node)];
      case "definition_list": {
        const out: Block[] = [];
        for (const item of node.children) {
          const [term, def] = item.children;
          out.push({
            type: "para",
            inlines: [
              { type: "strong", children: convertInlines(term.children) },
            ],
          });
          out.push(...convertBlocks(def.children));
        }
        return out;
      }
      default:
        return [];
    }
  }

  function convertBlocks(nodes: DjBlock[]): Block[] {
    const out: Block[] = [];
    for (const n of nodes) out.push(...convertBlock(n));
    return out;
  }

  const blocks = $derived.by<Block[]>(() => {
    try {
      const doc = parse(content);
      references = { ...doc.references, ...doc.autoReferences };
      return convertBlocks(doc.children);
    } catch {
      return [{ type: "para", inlines: [{ type: "text", value: content }] }];
    }
  });

  let resolvedUsers = $state<Record<string, NostrUser>>({});
  let resolvedThreads = $state<Record<string, ThreadRef>>({});

  $effect(() => {
    const seen = new Set<string>();
    const seenRefs = new Set<string>();
    const collect = (inlines: Inline[]) => {
      for (const inline of inlines) {
        if (inline.type === "mention" || inline.type === "thread-quote")
          seen.add(inline.pubkey);
        else if (inline.type === "entity" && inline.id) seenRefs.add(inline.id);
        else if (
          inline.type === "strong" ||
          inline.type === "em" ||
          inline.type === "del"
        )
          collect(inline.children);
      }
    };
    const visit = (blocks: Block[]) => {
      for (const block of blocks) {
        if (block.type === "para" || block.type === "heading")
          collect(block.inlines);
        else if (block.type === "blockquote") visit(block.blocks);
        else if (block.type === "list")
          for (const item of block.items) visit(item.blocks);
        else if (block.type === "table")
          for (const row of block.rows)
            for (const cell of row.cells) collect(cell.inlines);
      }
    };
    visit(blocks);
    for (const pubkey of seen) {
      if (resolvedUsers[pubkey] || profiles[pubkey]) continue;
      loadNostrUser(pubkey).then((u) => {
        resolvedUsers = { ...resolvedUsers, [pubkey]: u };
      });
    }
    for (const id of seenRefs) {
      if (resolvedThreads[id]) continue;
      resolveThreadRef(id).then((ref) => {
        if (ref) resolvedThreads = { ...resolvedThreads, [id]: ref };
      });
    }
  });
</script>

{#snippet renderInlines(inlines: Inline[])}
  {#each inlines as inline (inline)}
    {#if inline.type === "link"}
      {@const internal = inline.href.startsWith("/")}
      <a
        href={inline.href}
        target={internal ? undefined : "_blank"}
        rel={internal ? undefined : "noopener noreferrer"}
        class="text-accent break-all hover:underline">{inline.label}</a
      >
    {:else if inline.type === "mention"}
      {@const u = profiles[inline.pubkey] ?? resolvedUsers[inline.pubkey]}
      <a
        href="https://njump.me/{inline.entity}"
        target="_blank"
        rel="noopener noreferrer"
        class="text-accent hover:underline">@{u?.shortName ?? inline.fallback}</a
      >
    {:else if inline.type === "thread-quote"}
      {@const u = profiles[inline.pubkey] ?? resolvedUsers[inline.pubkey]}
      <a
        href="#post-{inline.eventId}"
        class="-ml-3 block bg-neutral-100 py-1 pl-3 leading-4 font-normal text-neutral-700 no-underline hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >{u?.shortName ?? inline.pubkey.slice(0, 8)} said
        <svg
          class="mb-0.5 inline w-3"
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
      </a>
    {:else if inline.type === "entity"}
      {@const ref = inline.id ? resolvedThreads[inline.id] : undefined}
      {#if ref}
        <a href={threadRefHref(ref)} class="text-accent hover:underline"
          >{ref.title}</a
        >
      {:else}
        <a
          href="https://njump.me/{inline.entity}"
          target="_blank"
          rel="noopener noreferrer"
          class="text-accent break-all hover:underline">{inline.label}</a
        >
      {/if}
    {:else if inline.type === "strong"}
      <strong>{@render renderInlines(inline.children)}</strong>
    {:else if inline.type === "em"}
      <em>{@render renderInlines(inline.children)}</em>
    {:else if inline.type === "del"}
      <del>{@render renderInlines(inline.children)}</del>
    {:else if inline.type === "code"}
      <code>{inline.value}</code>
    {:else if inline.type === "br"}
      <br />
    {:else if inline.type === "image"}
      <img
        src={inline.src}
        alt={inline.alt}
        loading="lazy"
        class="inline-block max-h-[1.5em] align-text-bottom"
      />
    {:else}{inline.value}{/if}
  {/each}
{/snippet}

{#snippet renderListItem(item: ListItem, tight: boolean)}
  <li>
    {#if item.checked !== null}
      <input
        type="checkbox"
        checked={item.checked}
        disabled
        aria-label={item.checked ? "Completed" : "Not completed"}
        class="mr-1 align-middle"
      />
    {/if}
    {#each item.blocks as b (b)}
      {#if tight && b.type === "para"}
        {@render renderInlines(b.inlines)}
      {:else}
        {@render renderBlocks([b])}
      {/if}
    {/each}
  </li>
{/snippet}

{#snippet renderBlocks(blocks: Block[])}
  {#each blocks as block (block)}
    {#if block.type === "image"}
      <img
        src={block.src}
        alt={block.alt}
        loading="lazy"
        class="block mx-auto w-full max-h-[80vh] object-contain rounded"
      />
    {:else if block.type === "blockquote"}
      <blockquote
        class="my-3 mb-3 border-l-3 border-neutral-200 pb-1 pl-3 text-neutral-500 dark:border-neutral-700 dark:text-neutral-400"
      >
        {@render renderBlocks(block.blocks)}
      </blockquote>
    {:else if block.type === "heading"}
      {@const tag = `h${Math.max(1, Math.min(block.level + headingOffset, 6))}`}
      <svelte:element this={tag}>
        {@render renderInlines(block.inlines)}
      </svelte:element>
    {:else if block.type === "code"}
      <pre class="overflow-x-auto"><code>{block.value}</code></pre>
    {:else if block.type === "hr"}
      <hr />
    {:else if block.type === "list"}
      {#if block.ordered}
        <ol start={block.start !== 1 ? block.start : undefined}>
          {#each block.items as item (item)}
            {@render renderListItem(item, block.tight)}
          {/each}
        </ol>
      {:else}
        <ul>
          {#each block.items as item (item)}
            {@render renderListItem(item, block.tight)}
          {/each}
        </ul>
      {/if}
    {:else if block.type === "table"}
      {@const headRows = block.rows.filter((r) => r.head)}
      {@const bodyRows = block.rows.filter((r) => !r.head)}
      <div class="my-4 overflow-x-auto">
        <table>
          {#if headRows.length}
            <thead>
              {#each headRows as row (row)}
                <tr>
                  {#each row.cells as cell (cell)}
                    <th
                      style:text-align={cell.align !== "default"
                        ? cell.align
                        : null}>{@render renderInlines(cell.inlines)}</th
                    >
                  {/each}
                </tr>
              {/each}
            </thead>
          {/if}
          <tbody>
            {#each bodyRows as row (row)}
              <tr>
                {#each row.cells as cell (cell)}
                  <td
                    style:text-align={cell.align !== "default"
                      ? cell.align
                      : null}>{@render renderInlines(cell.inlines)}</td
                  >
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p>{@render renderInlines(block.inlines)}</p>
    {/if}
  {/each}
{/snippet}

<div
  class="prose max-w-none leading-5 text-neutral-700 dark:text-neutral-300 [&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-neutral-100 [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5 dark:[&_:not(pre)>code]:bg-neutral-800 dark:[&_:not(pre)>code]:text-neutral-200 [&_blockquote_p]:before:content-none [&_blockquote_p]:after:content-none [&_code]:before:content-none [&_code]:after:content-none [&_img]:my-5 [&_p]:my-3 [&_pre]:bg-neutral-100 [&_pre]:text-neutral-800 dark:[&_pre]:bg-neutral-800 dark:[&_pre]:text-neutral-200 [&_table]:my-0"
>
  {@render renderBlocks(blocks)}
</div>
