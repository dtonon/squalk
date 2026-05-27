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
  };

  type Props = { thread: ThreadRow };
  let { thread }: Props = $props();
</script>

{#snippet avatar(a: Author, cls: string)}
  {#if a.picture}
    <img src={a.picture} alt="" class={cls} />
  {:else}
    <span
      class="{cls} flex items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-[10px] font-semibold text-neutral-500 dark:text-neutral-400"
    >
      {a.name[0].toUpperCase()}
    </span>
  {/if}
{/snippet}

<a
  href="/thread/{thread.id}"
  class="flex items-center gap-3 border-b border-neutral-100 dark:border-neutral-800 py-4 hover:bg-neutral-50 dark:hover:bg-neutral-800 sm:gap-6"
>
  <!-- Col 1: title + byline -->
  <div class="min-w-0 flex-1">
    <div class="mb-1.5 text-lg leading-5 text-neutral-900 dark:text-neutral-100">{thread.title}</div>
    <div class="flex items-center gap-1.5 text-sm text-neutral-500 dark:text-neutral-400">
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

  <!-- Col 3: replies | activity -->
  <div class="flex shrink-0 items-center gap-4 sm:gap-6">
    <div class="flex flex-col items-center gap-0.5">
      <span class="text-neutral-800 dark:text-neutral-200">{thread.replyCount}</span>
      <span class="text-sm text-neutral-400 dark:text-neutral-500">replies</span>
    </div>

    <div class="flex flex-col items-center gap-0.5">
      <div class="flex items-center gap-1">
        {@render avatar(
          thread.lastActiveAuthor,
          "h-5 w-5 rounded-full object-cover",
        )}
        <span class="text-neutral-800 dark:text-neutral-200">{thread.lastActivity}</span>
      </div>
      <span class="text-sm text-neutral-400 dark:text-neutral-500">activity</span>
    </div>
  </div>
</a>
