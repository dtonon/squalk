<script lang="ts">
  import { loadNostrUser, type NostrUser } from "@nostr/gadgets/metadata";
  import { tokenizeChat } from "$lib/linkify";
  import {
    resolveThreadRef,
    threadRefHref,
    type ThreadRef,
  } from "$lib/threadRefs";

  type Props = {
    content: string;
    profiles?: Record<string, NostrUser>;
  };

  let { content, profiles = {} }: Props = $props();

  const tokens = $derived(tokenizeChat(content));

  let resolvedUsers = $state<Record<string, NostrUser>>({});
  let resolvedThreads = $state<Record<string, ThreadRef>>({});

  $effect(() => {
    for (const t of tokens) {
      if (t.type === "mention") {
        if (resolvedUsers[t.pubkey] || profiles[t.pubkey]) continue;
        loadNostrUser(t.pubkey).then((u) => {
          resolvedUsers = { ...resolvedUsers, [t.pubkey]: u };
        });
      } else if (t.type === "entity" && t.id && !resolvedThreads[t.id]) {
        const id = t.id;
        resolveThreadRef(id).then((ref) => {
          if (ref) resolvedThreads = { ...resolvedThreads, [id]: ref };
        });
      }
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
      >{:else if t.type === "entity"}{@const ref = t.id
        ? resolvedThreads[t.id]
        : undefined}{#if ref}<a
          href={threadRefHref(ref)}
          class="text-brand hover:underline">{ref.title}</a
        >{:else}<a
          href={t.href}
          target="_blank"
          rel="noopener noreferrer"
          class="text-brand hover:underline">{t.label}</a
        >{/if}{:else if t.type === "link"}<a
        href={t.href}
        title={t.href}
        target="_blank"
        rel="noopener noreferrer"
        class="text-brand hover:underline">{t.label}</a
      >{:else}{t.value}{/if}{/each}</span
>
