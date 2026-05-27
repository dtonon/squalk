<script lang="ts">
  import { toastStore, dismissToast } from "$lib/toast.svelte";

  const message = $derived(toastStore.message);
</script>

{#if message}
  <div
    class="fixed bottom-6 left-1/2 z-60 -translate-x-1/2 px-4"
    role="status"
    aria-live="polite"
  >
    <div
      class="flex items-center gap-3 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm text-white shadow-xl"
    >
      <span>{message}</span>
      <button
        type="button"
        onclick={dismissToast}
        aria-label="Dismiss"
        class="text-lg leading-none text-neutral-400 dark:text-neutral-500 hover:text-white"
      >
        ×
      </button>
    </div>
  </div>
{/if}
