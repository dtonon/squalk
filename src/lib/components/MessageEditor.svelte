<script lang="ts">
  import { tick } from "svelte";
  import { uploadImage } from "$lib/blossom";
  import { BLOSSOM_URL } from "$lib/config";
  import PostContent from "$lib/components/PostContent.svelte";

  type Props = {
    value: string;
    uploading?: boolean;
    disabled?: boolean;
    rows?: number;
    placeholder?: string;
    minHeightClass?: string;
  };

  let {
    value = $bindable(),
    uploading = $bindable(false),
    disabled = false,
    rows = 4,
    placeholder = "",
    minHeightClass = "",
  }: Props = $props();

  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let fileInputEl = $state<HTMLInputElement | null>(null);
  let uploadError = $state<string | null>(null);
  let previewing = $state(false);

  export function focus() {
    textareaEl?.focus();
  }

  function togglePreview() {
    previewing = !previewing;
  }

  function onUploadClick() {
    fileInputEl?.click();
  }

  async function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    uploadError = null;
    uploading = true;
    try {
      const blob = await uploadImage(file);
      const ta = textareaEl;
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const sep = before.length > 0 && !before.endsWith("\n") ? "\n" : "";
        const insertion = sep + blob.url + "\n";
        value = before + insertion + after;
        await tick();
        ta.focus();
        const pos = (before + insertion).length;
        ta.setSelectionRange(pos, pos);
      } else {
        value = (value ? value + "\n" : "") + blob.url + "\n";
      }
    } catch (err) {
      uploadError = err instanceof Error ? err.message : "Upload failed";
    } finally {
      uploading = false;
      input.value = "";
    }
  }
</script>

<div class="flex flex-col {previewing ? 'flex-1 min-h-0' : ''}">
  {#if previewing}
    <div
      class="w-full rounded-t border border-gray-200 px-3 py-2 overflow-auto flex-1 min-h-0 max-h-[70vh] {minHeightClass}"
      aria-label="Preview"
    >
      {#if value.trim()}
        <PostContent content={value} />
      {:else}
        <p class="text-gray-400 italic">Nothing to preview</p>
      {/if}
    </div>
  {:else}
    <textarea
      bind:this={textareaEl}
      bind:value
      {disabled}
      {rows}
      {placeholder}
      class="w-full rounded-t border border-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50 resize-none {minHeightClass}"
    ></textarea>
  {/if}
  <div
    class="flex flex-shrink-0 items-center gap-4 rounded-b border border-t-0 border-gray-200 bg-gray-50 px-3 py-2 text-sm"
  >
    <button
      type="button"
      onclick={onUploadClick}
      disabled={uploading || disabled || previewing || !BLOSSOM_URL}
      title={!BLOSSOM_URL ? "Blossom server not configured" : ""}
      class="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      {uploading ? "Uploading…" : "Upload image"}
    </button>
    {#if uploadError}
      <span class="text-xs text-red-600">{uploadError}</span>
    {/if}
    <button
      type="button"
      onclick={togglePreview}
      disabled={disabled || uploading}
      aria-pressed={previewing}
      class="ml-auto inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      {previewing ? "Edit" : "Preview"}
    </button>
  </div>
  <input
    type="file"
    bind:this={fileInputEl}
    onchange={onFileChange}
    accept="image/*"
    class="hidden"
  />
</div>
