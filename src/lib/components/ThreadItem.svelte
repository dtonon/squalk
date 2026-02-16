<script lang="ts">
  import type { Thread } from "$lib/mock";
  import Tag from "./Tag.svelte";

  type Props = { thread: Thread };
  let { thread }: Props = $props();

  // Placeholder until scoring formula is defined
  const score = $derived(
    thread.op.reactions.reduce((s, r) => s + r.count, 0) + thread.op.zaps,
  );
</script>

<a
  href="/thread/{thread.id}"
  class="flex items-center gap-6 border-b border-gray-100 py-4 hover:bg-gray-50"
>
  <!-- Col 1: title + byline -->
  <div class="flex-1 min-w-0">
    <div class="text-lg mb-1.5 text-gray-900 leading-6">{thread.title}</div>
    <div class="flex items-center gap-1.5 text-sm text-gray-500">
      <span>by</span>
      <img
        src={thread.op.author.picture}
        alt={thread.op.author.name}
        class="h-5 w-5 rounded-full"
      />
      {#if thread.participants.length > 1}
        <span>and</span>
        <div class="flex -space-x-1.5">
          {#each thread.participants
            .filter((p) => p.pubkey !== thread.op.author.pubkey)
            .slice(0, 4) as p}
            <img
              src={p.picture}
              alt={p.name}
              class="h-5 w-5 rounded-full ring-1 ring-white"
            />
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <!-- Col 2: tags -->
  <div class="flex shrink-0 flex-wrap justify-end gap-1.5">
    {#each thread.tags as tag}
      <Tag label={tag.label} />
    {/each}
  </div>

  <!-- Col 3: replies | score | activity -->
  <div class="flex shrink-0 items-center gap-6">
    <div class="flex flex-col items-center gap-0.5">
      <span class=" text-gray-800">{thread.replyCount}</span>
      <span class="text-sm text-gray-400">replies</span>
    </div>

    <div class="flex flex-col items-center gap-0.5">
      <span class=" text-accent">{score}</span>
      <span class="text-sm text-gray-400">score</span>
    </div>

    <div class="flex flex-col items-center gap-0.5">
      <div class="flex items-center gap-1">
        <img
          src={thread.participants[thread.participants.length - 1].picture}
          alt={thread.participants[thread.participants.length - 1].name}
          class="h-5 w-5 rounded-full"
        />
        <span class=" text-gray-800">{thread.lastActivity}</span>
      </div>
      <span class="text-sm text-gray-400">activity</span>
    </div>
  </div>
</a>
