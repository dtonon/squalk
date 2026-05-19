<script lang="ts">
  import { overviewStore } from "$lib/overview.svelte";
  import { groupsStore } from "$lib/groups.svelte";
  import type { NostrUser } from "@nostr/gadgets/metadata";

  function roomName(id: string) {
    return groupsStore.list.find((g) => g.id === id)?.name ?? id;
  }

  function authorOf(pubkey: string) {
    const u: NostrUser | undefined = overviewStore.profiles[pubkey];
    return {
      name: u?.shortName ?? pubkey.slice(0, 8),
      picture: u?.metadata?.picture,
    };
  }
</script>

<aside aria-label="Latest discussions">
  <h2 class="pb-2 text-[1.5rem] leading-7 text-brand">Latest discussions</h2>
  {#if overviewStore.recent.length === 0}
    <p class="text-sm text-neutral-400">
      {overviewStore.loading ? "Loading…" : "Nothing yet."}
    </p>
  {:else}
    <ul class="divide-y divide-neutral-100">
      {#each overviewStore.recent as t}
        {@const author = authorOf(t.authorPubkey)}
        <li>
          <a href="/thread/{t.id}" class="group block py-3">
            <p
              class="line-clamp-2 text-lg text-neutral-700 leading-5 group-hover:text-brand"
            >
              {t.title}
            </p>
            <div
              class="mt-1.5 flex items-center gap-1.5 text-xs text-neutral-400"
            >
              <span>by</span>
              {#if author.picture}
                <img
                  src={author.picture}
                  alt=""
                  class="h-5 w-5 rounded-full object-cover"
                />
              {:else}
                <span
                  class="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-500"
                  aria-hidden="true"
                >
                  {author.name[0].toUpperCase()}
                </span>
              {/if}
              <span aria-hidden="true">in</span>
              <span class="truncate">{roomName(t.groupId)}</span>
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</aside>
