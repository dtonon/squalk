<script lang="ts">
  import { chatMessages } from "$lib/mock";

  type Props = {
    expanded?: boolean;
    onToggle: () => void;
  };

  let { expanded = false, onToggle }: Props = $props();
</script>

<aside
  class="flex shrink-0 flex-col rounded-tl-xl min-[1540px]:rounded-tr-xl bg-white transition-all duration-200
		{expanded ? 'w-[420px]' : 'w-80'}"
>
  <div class="flex h-12 shrink-0 items-center justify-between px-4">
    <span class="font-semibold text-gray-900">Chat</span>
    <button
      onclick={onToggle}
      class="text-gray-400 hover:text-gray-600"
      aria-label="Toggle chat size"
    >
      {#if expanded}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
            clip-rule="evenodd"
          />
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fill-rule="evenodd"
            d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
            clip-rule="evenodd"
          />
        </svg>
      {/if}
    </button>
  </div>

  <div class="flex-1 overflow-y-auto p-3 space-y-3">
    {#each chatMessages as msg}
      <div class="flex gap-2">
        <img
          src={msg.author.picture}
          alt={msg.author.name}
          class="h-7 w-7 shrink-0 rounded-full"
        />
        <div>
          <span class="text-xs font-semibold text-gray-900"
            >{msg.author.name}</span
          >
          <p class=" text-gray-700">{msg.content}</p>
        </div>
      </div>
    {/each}
  </div>

  <div class="border-t border-gray-200 p-3">
    <input
      type="text"
      placeholder="Message..."
      class="w-full rounded border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
    />
  </div>
</aside>
