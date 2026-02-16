<script lang="ts">
  import { threads } from "$lib/mock";
  import Tag from "$lib/components/Tag.svelte";
  import Reactions from "$lib/components/Reactions.svelte";
  import { page } from "$app/state";

  const thread = $derived(threads.find((t) => t.id === page.params.id));

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
</script>

<svelte:head>
  <title>{thread?.title ?? "Thread"}</title>
</svelte:head>

{#if thread}
  <div class="max-w-4xl">
    <!-- Thread header -->
    <div class="mb-6">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        <h1 class="text-[1.65rem] text-brand leading-7">{thread.title}</h1>
      </div>
      <div class="flex gap-2">
        {#each thread.tags as tag}
          <Tag label={tag.label} color={tag.color} />
        {/each}
      </div>
    </div>

    <!-- OP -->
    <div class="mb-8">
      <div class="flex items-center gap-2 mb-3">
        <img
          src={thread.op.author.picture}
          alt={thread.op.author.name}
          class="h-8 w-8 rounded-full"
        />
        <div>
          <span class="font-semibold text-gray-900"
            >{thread.op.author.name}</span
          >
          <span class="ml-2 text-xs text-gray-400"
            >{formatDate(thread.op.createdAt)}</span
          >
        </div>
      </div>
      <div class="prose leading-6 max-w-none text-gray-700 mb-4">
        {#each thread.op.content.split("\n\n") as para}
          <p>{para}</p>
        {/each}
      </div>
      <Reactions reactions={thread.op.reactions} zaps={thread.op.zaps} />
    </div>

    <!-- Replies -->
    {#if thread.op.replies && thread.op.replies.length > 0}
      <div class="border-t border-gray-200 pt-6 space-y-6">
        <h2
          class="text-sm font-semibold uppercase tracking-wider text-gray-400"
        >
          {thread.op.replies.length}
          {thread.op.replies.length === 1 ? "reply" : "replies"}
        </h2>
        {#each thread.op.replies as reply}
          <div>
            <div class="flex items-center gap-2 mb-2">
              <img
                src={reply.author.picture}
                alt={reply.author.name}
                class="h-7 w-7 rounded-full"
              />
              <div>
                <span class="font-semibold text-gray-900"
                  >{reply.author.name}</span
                >
                <span class="ml-2 text-xs text-gray-400"
                  >{formatDate(reply.createdAt)}</span
                >
              </div>
            </div>
            <p class=" text-gray-700 mb-2">{reply.content}</p>
            <Reactions reactions={reply.reactions} zaps={reply.zaps} />
          </div>
        {/each}
      </div>
    {/if}

    <!-- Reply box -->
    <div class="mt-8 border-t border-gray-200 pt-6">
      <textarea
        rows="4"
        placeholder="Write a reply..."
        class="w-full rounded border border-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand"
      ></textarea>
      <div class="mt-2 flex justify-end">
        <button
          class="rounded bg-brand px-6 py-1.5 font-medium text-white hover:bg-brand-hover"
        >
          Reply
        </button>
      </div>
    </div>
  </div>
{:else}
  <div class="px-6 py-6 text-gray-500">Thread not found.</div>
{/if}
