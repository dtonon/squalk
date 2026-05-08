<script lang="ts">
  import { tick } from "svelte";
  import {
    chatStore,
    getChatMessage,
    sendChatMessage,
    type ChatMessageData,
  } from "$lib/chat.svelte";
  import { auth, openLogin } from "$lib/auth.svelte";
  import { withJoin } from "$lib/join.svelte";
  import type { NostrUser } from "@nostr/gadgets/metadata";

  type Props = {
    expanded?: boolean;
    onToggle: () => void;
  };

  let { expanded = false, onToggle }: Props = $props();

  let asideEl: HTMLElement;
  let listEl = $state<HTMLDivElement | null>(null);
  let inputEl = $state<HTMLTextAreaElement | null>(null);
  let openMenuId = $state<string | null>(null);
  let replyTarget = $state<ChatMessageData | null>(null);
  let inputValue = $state("");
  let sending = $state(false);
  let sendError = $state<string | null>(null);

  const messages = $derived(chatStore.messages);
  const profiles = $derived(chatStore.profiles);

  function resolveAuthor(pubkey: string) {
    const u: NostrUser | undefined = profiles[pubkey];
    return {
      name: u?.shortName ?? pubkey.slice(0, 8),
      picture: u?.metadata?.picture,
    };
  }

  function formatTime(ts: number) {
    return new Date(ts * 1000).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function truncate(s: string, n = 60) {
    const t = s.replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t;
  }

  function startReply(msg: ChatMessageData) {
    replyTarget = msg;
    openMenuId = null;
    tick().then(() => inputEl?.focus());
  }

  function cancelReply() {
    replyTarget = null;
  }

  async function submit() {
    const content = inputValue.trim();
    if (!content) return;
    if (!auth.user) {
      openLogin();
      return;
    }
    sending = true;
    sendError = null;
    const reply = replyTarget
      ? { id: replyTarget.id, pubkey: replyTarget.pubkey }
      : undefined;
    try {
      await withJoin(async () => {
        await sendChatMessage(content, reply);
        inputValue = "";
        replyTarget = null;
        userScrolledUp = false;
        await tick();
        if (listEl) listEl.scrollTop = listEl.scrollHeight;
      });
    } catch (e) {
      sendError = e instanceof Error ? e.message : "Failed to send";
    } finally {
      sending = false;
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape" && replyTarget) {
      e.preventDefault();
      cancelReply();
    }
  }

  // Track whether user scrolled away from the bottom to read older messages.
  let userScrolledUp = false;

  function onListScroll() {
    if (!listEl) return;
    const distance =
      listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
    userScrolledUp = distance > 100;
  }

  // Anchor to bottom on new messages, unless user is reading older ones.
  $effect(() => {
    messages.length;
    if (!listEl || userScrolledUp) return;
    tick().then(() => {
      if (listEl) listEl.scrollTop = listEl.scrollHeight;
    });
  });

  $effect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      if (!asideEl.contains(e.target as Node)) onToggle();
    }
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  });

  $effect(() => {
    if (!openMenuId) return;
    function closeMenu() {
      openMenuId = null;
    }
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  });
</script>

<aside
  bind:this={asideEl}
  class="absolute right-0 top-2 h-[calc(100%-0.5rem)] z-10 flex flex-col rounded-tl-xl min-[1540px]:rounded-tr-xl bg-white transition-all duration-200
		{expanded ? 'w-150 shadow-2xl' : 'w-80 shadow-lg'} px-6 py-6"
>
  <div class="flex shrink-0 items-center justify-between mb-6">
    <span class="text-[1.5rem] text-brand leading-7">Chat</span>
    <button
      onclick={onToggle}
      class="rounded bg-neutral-100 hover:bg-neutral-200 transition-colors"
      aria-label={expanded ? "Collapse chat" : "Expand chat"}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        class="h-7 w-7"
        viewBox="0 0 37 33"
        fill="none"
      >
        {#if expanded}
          <path
            d="M10.8656 23.2958C11.0971 23.0642 11.4726 23.0642 11.7042 23.2958C11.9358 23.5274 11.9358 23.9029 11.7042 24.1344L11.0124 24.8263C10.7808 25.0579 10.4053 25.0579 10.1737 24.8263C9.9421 24.5947 9.9421 24.2192 10.1737 23.9876L10.8656 23.2958ZM25.9876 8.17369C26.2192 7.9421 26.5947 7.9421 26.8263 8.17369C27.0579 8.40528 27.0579 8.78077 26.8263 9.01235L22.3038 13.5349H25.5033L25.5186 13.5351C25.839 13.5432 26.0963 13.8055 26.0963 14.1279C26.0963 14.4503 25.839 14.7126 25.5186 14.7207L25.5033 14.7209H20.8721C20.5446 14.7209 20.2791 14.4554 20.2791 14.1279V9.49669C20.2791 9.16917 20.5446 8.90367 20.8721 8.90366C21.1996 8.90366 21.4651 9.16917 21.4651 9.49669L21.4651 12.6962L25.9876 8.17369ZM16.7209 23.5033C16.7209 23.8308 16.4554 24.0963 16.1279 24.0963C15.8004 24.0963 15.5349 23.8308 15.5349 23.5033V20.3038L13.7798 22.0589C13.5482 22.2905 13.1727 22.2904 12.9411 22.0589C12.7095 21.8273 12.7095 21.4518 12.9411 21.2202L14.6962 19.4651H11.4967C11.1692 19.4651 10.9037 19.1996 10.9037 18.8721C10.9037 18.5446 11.1692 18.2791 11.4967 18.2791H16.1279C16.4554 18.2791 16.7209 18.5446 16.7209 18.8721V23.5033Z"
            fill="#3C3C3C"
          />
        {:else}
          <path
            d="M15.7086 18.4527C15.9402 18.2212 16.3156 18.2212 16.5472 18.4527C16.7788 18.6843 16.7788 19.0598 16.5472 19.2914L12.0247 23.814H15.2243L15.2395 23.8141C15.56 23.8223 15.8173 24.0846 15.8173 24.407C15.8173 24.7294 15.56 24.9917 15.2395 24.9998L15.2243 25H10.593C10.2655 25 10 24.7345 10 24.407V19.7758C10 19.4483 10.2655 19.1827 10.593 19.1827C10.9154 19.1827 11.1777 19.44 11.1859 19.7605L11.186 19.7758V22.9753L15.7086 18.4527ZM21.1446 13.0167C21.3762 12.7851 21.7517 12.7851 21.9833 13.0167C22.2149 13.2483 22.2149 13.6238 21.9833 13.8554L21.2914 14.5472C21.0598 14.7788 20.6843 14.7788 20.4527 14.5472C20.2212 14.3156 20.2212 13.9402 20.4527 13.7086L21.1446 13.0167ZM27 13.2243C27 13.5518 26.7345 13.8173 26.407 13.8173C26.0795 13.8173 25.814 13.5518 25.814 13.2243V10.0247L24.0589 11.7798C23.8273 12.0114 23.4518 12.0114 23.2202 11.7798C22.9886 11.5482 22.9886 11.1727 23.2202 10.9411L24.9753 9.18605H21.7758C21.4483 9.18604 21.1827 8.92054 21.1827 8.59302C21.1827 8.26551 21.4483 8 21.7758 8H26.407L26.4223 8.00019C26.7427 8.0083 27 8.27062 27 8.59302V13.2243Z"
            fill="#3C3C3C"
          />
        {/if}
      </svg>
    </button>
  </div>

  <div
    bind:this={listEl}
    onscroll={onListScroll}
    class="flex-1 overflow-y-auto flex flex-col"
  >
    {#if messages.length === 0}
      <div class="m-auto text-center text-sm text-neutral-400 py-8">
        No messages yet.
      </div>
    {:else}
      <div class="mt-auto space-y-4 pb-4">
        {#each messages as msg (msg.id)}
          {@const author = resolveAuthor(msg.pubkey)}
          {@const parent = msg.replyToId ? getChatMessage(msg.replyToId) : null}
          {@const parentAuthor = parent ? resolveAuthor(parent.pubkey) : null}
          <div>
            <div class="flex items-center gap-2 mb-1">
              {#if author.picture}
                <img
                  src={author.picture}
                  alt=""
                  class="h-6 w-6 shrink-0 rounded-full object-cover"
                />
              {:else}
                <span
                  class="h-6 w-6 shrink-0 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-semibold text-neutral-500"
                >
                  {author.name[0].toUpperCase()}
                </span>
              {/if}
              <span class="font-medium text-neutral-600">{author.name}</span>
              <span class="ml-auto text-xs text-neutral-400"
                >{formatTime(msg.createdAt)}</span
              >
            </div>
            <div class="mt-0.5">
              {#if msg.replyToId}
                <div
                  class="mb-1 border-l-2 border-neutral-300 pl-2 text-xs text-neutral-500"
                >
                  {#if parent}
                    <span class="font-medium">{parentAuthor?.name}</span>:
                    {truncate(parent.content)}
                  {:else}
                    <span class="italic">Replying to a message</span>
                  {/if}
                </div>
              {/if}
              <p
                class="text-neutral-700 leading-5 whitespace-pre-wrap break-words"
              >
                {msg.content}
              </p>
              <div class="mt-0.5 flex items-center gap-2">
                <div class="relative ml-auto">
                  <button
                    onclick={(e) => {
                      e.stopPropagation();
                      openMenuId = openMenuId === msg.id ? null : msg.id;
                    }}
                    class="flex items-center justify-center rounded p-0.5 text-neutral-300 hover:text-neutral-500 hover:bg-neutral-100 transition-colors"
                    aria-label="Message actions"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="h-4 w-4"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"
                      />
                    </svg>
                  </button>
                  {#if openMenuId === msg.id}
                    <div
                      class="absolute right-0 bottom-6 z-20 w-36 rounded-lg border border-neutral-100 bg-white py-1 shadow-lg text-sm"
                    >
                      <button
                        disabled
                        class="w-full px-3 py-1.5 text-left text-neutral-400 cursor-not-allowed"
                        aria-disabled="true">React</button
                      >
                      <button
                        disabled
                        class="w-full px-3 py-1.5 text-left text-neutral-400 cursor-not-allowed"
                        aria-disabled="true">Zap</button
                      >
                      <button
                        onclick={(e) => {
                          e.stopPropagation();
                          startReply(msg);
                        }}
                        class="w-full px-3 py-1.5 text-left hover:bg-neutral-50"
                        >Reply</button
                      >
                    </div>
                  {/if}
                </div>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="border-t border-neutral-200 pt-4">
    {#if replyTarget}
      {@const replyAuthor = resolveAuthor(replyTarget.pubkey)}
      <div
        class="mb-2 flex items-start gap-2 rounded bg-neutral-50 px-2 py-1.5 text-xs text-neutral-600"
      >
        <div class="flex-1 min-w-0">
          <span class="text-neutral-400">↳ Reply to </span>
          <span class="font-medium">{replyAuthor.name}</span>:
          <span class="text-neutral-500"
            >{truncate(replyTarget.content, 80)}</span
          >
        </div>
        <button
          onclick={cancelReply}
          class="shrink-0 text-neutral-400 hover:text-neutral-600"
          aria-label="Cancel reply"
        >
          ✕
        </button>
      </div>
    {/if}
    {#if sendError}
      <div
        class="mb-2 rounded bg-red-50 px-2 py-1.5 text-xs text-red-700 border border-red-200"
      >
        {sendError}
      </div>
    {/if}
    <textarea
      bind:this={inputEl}
      bind:value={inputValue}
      onkeydown={onKeydown}
      rows="1"
      disabled={sending}
      placeholder={auth.user ? "Message..." : "Login to send messages"}
      class="w-full resize-none rounded border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
    ></textarea>
  </div>
</aside>
