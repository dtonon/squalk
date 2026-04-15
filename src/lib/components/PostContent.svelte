<script lang="ts">
  import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";
  import * as nip19 from "@nostr/tools/nip19";

  type Props = {
    content: string;
    profiles?: Record<string, NostrUser>;
  };

  let { content, profiles = {} }: Props = $props();

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

  const paragraphs = $derived(
    content.split(/\n{2,}/).map((para) => tokenize(para)),
  );

  let resolvedUsers = $state<Record<string, NostrUser>>({});

  $effect(() => {
    const seen = new Set<string>();
    for (const blocks of paragraphs) {
      for (const block of blocks) {
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
</script>

<div class="prose leading-5 max-w-none text-gray-700 [&_p]:my-3 [&_img]:my-3">
  {#each paragraphs as blocks}
    {#each blocks as block}
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
                class="text-brand hover:underline break-all">{inline.label}</a
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
                class="text-brand hover:underline break-all">{inline.label}</a
              >
            {:else}{inline.value}{/if}
          {/each}
        </p>
      {/if}
    {/each}
  {/each}
</div>
