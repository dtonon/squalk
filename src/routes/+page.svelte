<script lang="ts">
  import DiscussionsFeed from "$lib/components/DiscussionsFeed.svelte";
  import PostContent from "$lib/components/PostContent.svelte";
  import { groupsStore } from "$lib/groups.svelte";
  import { overviewStore, loadOverview } from "$lib/overview.svelte";
  import { partialsStore } from "$lib/partials.svelte";
  import { MODE, GROUP_ID } from "$lib/config";
  import type { NostrUser } from "@nostr/gadgets/metadata";

  const partial = $derived(partialsStore.get("home"));

  // Full mode: load per-room activity + recent threads once the rooms are known.
  $effect(() => {
    if (MODE !== "full") return;
    const ids = groupsStore.list.map((g) => g.id);
    if (ids.length > 0) loadOverview(ids);
  });

  function relativeTime(ts: number): string {
    const diff = Math.floor(Date.now() / 1000) - ts;
    if (diff < 60) return "now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return `${Math.floor(diff / 86400)}d`;
  }

  function authorOf(pubkey: string) {
    const u: NostrUser | undefined = overviewStore.profiles[pubkey];
    return {
      name: u?.shortName ?? pubkey.slice(0, 8),
      picture: u?.metadata?.picture,
    };
  }
</script>

<svelte:head>
  <title>{MODE === "full" ? "Rooms" : "Discussions"}</title>
</svelte:head>

{#snippet pic(a: { name: string; picture?: string })}
  {#if a.picture}
    <img src={a.picture} alt="" class="h-5 w-5 rounded-full object-cover" />
  {:else}
    <span
      class="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-500"
      aria-hidden="true"
    >
      {a.name[0].toUpperCase()}
    </span>
  {/if}
{/snippet}

{#if partial}
  <div class="mt-4 mb-8">
    <PostContent content={partial.content} headingOffset={0} />
  </div>
{/if}

{#if MODE === "simple"}
  <DiscussionsFeed groupId={GROUP_ID} title="Discussions" />
{:else}
  <h1 class="py-2 text-[1.65rem] text-brand">Rooms</h1>

  {#if groupsStore.list.length === 0}
    <p class="py-6 text-sm text-neutral-400">
      {groupsStore.loaded ? "No rooms available yet." : "Loading rooms…"}
    </p>
  {/if}

  <div class="divide-y divide-neutral-100">
    {#each groupsStore.list as room}
      {@const act = overviewStore.activity[room.id]}
      {@const adminPk = overviewStore.admins[room.id]}
      {@const admin = adminPk ? authorOf(adminPk) : null}
      {@const last = act ? authorOf(act.latestPubkey) : null}
      <a
        href="/room/{room.id}"
        class="group flex items-start justify-between gap-4 py-5"
      >
        <div class="min-w-0">
          <h2 class="text-2xl text-neutral-800 group-hover:text-brand">
            {room.name}
          </h2>
          {#if room.about}
            <p class="mt-1 text-neutral-600 leading-5">{room.about}</p>
          {/if}
          {#if admin}
            <div class="mt-2 flex items-center gap-2 text-sm text-neutral-500">
              <span>Admin</span>
              {@render pic(admin)}
            </div>
          {/if}
        </div>
        {#if act && last}
          <div class="flex shrink-0 flex-col items-center gap-0.5">
            <div class="flex items-center gap-1">
              {@render pic(last)}
              <span class="text-neutral-800">{relativeTime(act.latestAt)}</span>
            </div>
            <span class="text-sm text-neutral-400">activity</span>
          </div>
        {/if}
      </a>
    {/each}
  </div>
{/if}
