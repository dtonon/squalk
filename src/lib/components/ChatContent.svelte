<script lang="ts">
  import * as nip19 from "@nostr/tools/nip19";
  import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";

  type Props = {
    content: string;
    profiles?: Record<string, NostrUser>;
  };

  let { content, profiles = {} }: Props = $props();

  type Token =
    | { type: "text"; value: string }
    | { type: "mention"; pubkey: string; entity: string; fallback: string };

  const MENTION_RE = /nostr:(npub1[a-z0-9]+|nprofile1[a-z0-9]+)/gi;

  function shortEntity(entity: string): string {
    const m = entity.match(/^(npub|nprofile)1/);
    if (!m) return entity;
    const prefix = m[0];
    const rest = entity.slice(prefix.length);
    if (rest.length <= 12) return entity;
    return `${prefix}${rest.slice(0, 6)}…${rest.slice(-4)}`;
  }

  const tokens = $derived.by<Token[]>(() => {
    const out: Token[] = [];
    let last = 0;
    for (const m of content.matchAll(MENTION_RE)) {
      const start = m.index ?? 0;
      const entity = m[1].toLowerCase();
      let pubkey: string | null = null;
      try {
        const decoded = nip19.decode(entity);
        if (decoded.type === "npub") pubkey = decoded.data;
        else if (decoded.type === "nprofile") pubkey = decoded.data.pubkey;
      } catch {
        // Invalid bech32, fall through to text
      }
      if (start > last)
        out.push({ type: "text", value: content.slice(last, start) });
      if (pubkey) {
        out.push({
          type: "mention",
          pubkey,
          entity,
          fallback: shortEntity(entity),
        });
      } else {
        out.push({ type: "text", value: m[0] });
      }
      last = start + m[0].length;
    }
    if (last < content.length)
      out.push({ type: "text", value: content.slice(last) });
    return out;
  });

  let resolvedUsers = $state<Record<string, NostrUser>>({});

  $effect(() => {
    for (const t of tokens) {
      if (t.type !== "mention") continue;
      if (resolvedUsers[t.pubkey] || profiles[t.pubkey]) continue;
      loadNostrUser(t.pubkey).then((u) => {
        resolvedUsers = { ...resolvedUsers, [t.pubkey]: u };
      });
    }
  });
</script>

<span class="break-words whitespace-pre-wrap"
  >{#each tokens as t (t)}{#if t.type === "mention"}{@const u =
        profiles[t.pubkey] ?? resolvedUsers[t.pubkey]}<a
        href="https://njump.me/{t.entity}"
        target="_blank"
        rel="noopener noreferrer"
        class="text-brand hover:underline">@{u?.shortName ?? t.fallback}</a
      >{:else}{t.value}{/if}{/each}</span
>
