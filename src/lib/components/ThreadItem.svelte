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
      class="{cls} flex items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-500"
    >
      {a.name[0].toUpperCase()}
    </span>
  {/if}
{/snippet}

<a
  href="/thread/{thread.id}"
  class="flex items-center gap-6 border-b border-gray-100 py-4 hover:bg-gray-50"
>
  <!-- Col 1: title + byline -->
  <div class="flex-1 min-w-0">
    <div class="text-lg mb-1.5 text-gray-900 leading-6">{thread.title}</div>
    <div class="flex items-center gap-1.5 text-sm text-gray-500">
      <span>by</span>
      {@render avatar(thread.author, "h-5 w-5 rounded-full object-cover")}
      {#if thread.repliers.length > 0}
        <span>and</span>
        <div class="flex -space-x-1.5">
          {#each thread.repliers as r, i}
            <span class="relative" style="z-index: {thread.repliers.length - i}">
              {@render avatar(r, "h-5 w-5 rounded-full object-cover ring-1 ring-white")}
            </span>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Col 3: replies | score | activity -->
  <div class="flex shrink-0 items-center gap-6">
    <div class="flex flex-col items-center gap-0.5">
      <span class="text-gray-800">{thread.replyCount}</span>
      <span class="text-sm text-gray-400">replies</span>
    </div>

    <div class="flex flex-col items-center gap-0.5">
      <span class="text-accent">{thread.score}</span>
      <span class="text-sm text-gray-400">score</span>
    </div>

    <div class="flex flex-col items-center gap-0.5">
      <div class="flex items-center gap-1">
        {@render avatar(thread.lastActiveAuthor, "h-5 w-5 rounded-full object-cover")}
        <span class="text-gray-800">{thread.lastActivity}</span>
      </div>
      <span class="text-sm text-gray-400">activity</span>
    </div>
  </div>
</a>
