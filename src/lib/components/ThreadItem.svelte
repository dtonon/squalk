<script lang="ts">
  import Tag from "./Tag.svelte";

  export type Author = {
    pubkey: string;
    name: string;
    picture?: string;
  };

  export type ThreadRow = {
    id: string;
    title: string;
    labels: string[];
    author: Author;
    replyCount: number;
    repliers: Author[];
    lastActiveAuthor: Author;
    lastActivity: string;
    score: number;
  };

  type Props = { thread: ThreadRow };
  let { thread }: Props = $props();
</script>

{#snippet avatar(a: Author, cls: string)}
  {#if a.picture}
    <img src={a.picture} alt="" class={cls} />
  {:else}
    <span
      class="{cls} flex items-center justify-center rounded-full bg-neutral-200 text-[10px] font-semibold text-neutral-500"
    >
      {a.name[0].toUpperCase()}
    </span>
  {/if}
{/snippet}

<a
  href="/thread/{thread.id}"
  class="flex items-center gap-6 border-b border-neutral-100 py-4 hover:bg-neutral-50"
>
  <!-- Col 1: title + byline -->
  <div class="flex-1 min-w-0">
    <div class="text-lg mb-1.5 text-neutral-900 leading-6">{thread.title}</div>
    <div class="flex items-center gap-1.5 text-sm text-neutral-500">
      <span>by</span>
      {@render avatar(thread.author, "h-5 w-5 rounded-full object-cover")}
      {#if thread.repliers.length > 0}
        <span>and</span>
        <div class="flex -space-x-1.5">
          {#each thread.repliers as r, i}
            <span
              class="relative"
              style="z-index: {thread.repliers.length - i}"
            >
              {@render avatar(
                r,
                "h-5 w-5 rounded-full object-cover ring-1 ring-white",
              )}
            </span>
          {/each}
        </div>
      {/if}
      {#if thread.labels.length > 0}
        <div class="ml-auto flex flex-wrap items-center justify-end gap-1">
          {#each thread.labels as l}
            <Tag label={l} />
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Col 3: replies | score | activity -->
  <div class="flex shrink-0 items-center gap-6">
    <div class="flex flex-col items-center gap-0.5">
      <span class="text-neutral-800">{thread.replyCount}</span>
      <span class="text-sm text-neutral-400">replies</span>
    </div>

    <div class="flex flex-col items-center gap-0.5">
      <span class="text-accent">{thread.score}</span>
      <span class="text-sm text-neutral-400">score</span>
    </div>

    <div class="flex flex-col items-center gap-0.5">
      <div class="flex items-center gap-1">
        {@render avatar(
          thread.lastActiveAuthor,
          "h-5 w-5 rounded-full object-cover",
        )}
        <span class="text-neutral-800">{thread.lastActivity}</span>
      </div>
      <span class="text-sm text-neutral-400">activity</span>
    </div>
  </div>
</a>
