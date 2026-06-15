<script lang="ts">
  import { tick } from "svelte";
  import {
    chatStore,
    getChatMessage,
    sendChatMessage,
    removeChatMessage,
    type ChatMessageData,
  } from "$lib/chat.svelte";
  import { auth, openLogin } from "$lib/auth.svelte";
  import { isGroupAdmin } from "$lib/admins.svelte";
  import { requestDelete } from "$lib/moderation.svelte";
  import {
    withJoin,
    membershipOf,
    ensureMembershipChecked,
    openJoinModal,
  } from "$lib/join.svelte";
  import { activeGroup } from "$lib/active.svelte";
  import type { NostrUser } from "@nostr/gadgets/metadata";
  import MentionAutocomplete from "$lib/components/MentionAutocomplete.svelte";
  import ChatContent from "$lib/components/ChatContent.svelte";
  import { shortNostrEntity } from "$lib/linkify";
  import { resolveThreadRef } from "$lib/threadRefs";
  import * as nip19 from "@nostr/tools/nip19";

  type Props = {
    expanded?: boolean;
    onToggle: () => void;
    mobileActive?: boolean;
  };

  let { expanded = false, onToggle, mobileActive = false }: Props = $props();

  let asideEl: HTMLElement;
  let listEl = $state<HTMLDivElement | null>(null);
  let inputEl = $state<MentionAutocomplete | null>(null);
  let openMenuId = $state<string | null>(null);
  let menuPos = $state<{ top?: number; bottom?: number; right: number } | null>(
    null,
  );
  let replyTarget = $state<ChatMessageData | null>(null);
  let inputValue = $state("");
  let sending = $state(false);
  let sendError = $state<string | null>(null);

  const messages = $derived(chatStore.messages);
  const profiles = $derived(chatStore.profiles);

  const canModerate = $derived(
    !!auth.user && isGroupAdmin(auth.user.pubkey, activeGroup.id),
  );

  // Sending needs membership regardless of flags. Only gate a confirmed guest;
  // while membership resolves the input stays (withJoin nets a stray send), so a
  // member never flashes "Join to chat".
  const joinToChat = $derived(
    !!auth.user && membershipOf(activeGroup.id) === "guest",
  );

  // Resolve membership on entry. Depends on auth.user so a silent session
  // restore re-runs the check.
  $effect(() => {
    auth.user;
    if (activeGroup.id) ensureMembershipChecked(activeGroup.id);
  });

  function onJoinToChat() {
    openJoinModal(activeGroup.id, () => tick().then(() => inputEl?.focus()));
  }

  function requestDeleteMessage(msg: ChatMessageData) {
    openMenuId = null;
    requestDelete(
      { eventId: msg.id, groupId: activeGroup.id, label: "message" },
      () => removeChatMessage(msg.id),
    );
  }

  // The message list clips overflow, so an absolute menu gets cut off by the top
  // bar or the input. Anchor it with fixed coords from the button instead,
  // opening upward unless there isn't room above.
  function toggleMenu(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (openMenuId === id) {
      openMenuId = null;
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const right = window.innerWidth - r.right;
    menuPos =
      r.top > 96
        ? { bottom: window.innerHeight - r.top + 4, right }
        : { top: r.bottom + 4, right };
    openMenuId = id;
  }

  // Distinct authors of loaded messages — power the @ autocomplete context.
  const contextPubkeys = $derived([...new Set(messages.map((m) => m.pubkey))]);

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

  function formatDay(ts: number) {
    const d = new Date(ts * 1000);
    const month = d.toLocaleDateString([], { month: "short" });
    return `${d.getDate()} ${month}`;
  }

  // True when this message starts a new calendar day vs the previous one.
  function isNewDay(ts: number, prevTs?: number) {
    if (prevTs === undefined) return true;
    const d = new Date(ts * 1000);
    const p = new Date(prevTs * 1000);
    return (
      d.getFullYear() !== p.getFullYear() ||
      d.getMonth() !== p.getMonth() ||
      d.getDate() !== p.getDate()
    );
  }

  const ENTITY_PATTERN = "nostr:(note1[a-z0-9]+|nevent1[a-z0-9]+)";

  // Resolved thread titles, keyed by the bech32 entity (note1…/nevent1…).
  let resolvedTitles = $state<Record<string, string>>({});

  $effect(() => {
    const re = new RegExp(ENTITY_PATTERN, "gi");
    const entities = new Set<string>();
    for (const m of messages)
      for (const match of m.content.matchAll(re))
        entities.add(match[1].toLowerCase());
    for (const entity of entities) {
      if (resolvedTitles[entity]) continue;
      let id: string | null = null;
      try {
        const d = nip19.decode(entity);
        if (d.type === "note") id = d.data;
        else if (d.type === "nevent") id = d.data.id;
      } catch {
        // Invalid bech32, skip
      }
      if (!id) continue;
      resolveThreadRef(id).then((ref) => {
        if (ref) resolvedTitles = { ...resolvedTitles, [entity]: ref.title };
      });
    }
  });

  function truncate(s: string, n = 60) {
    // Collapse mentions to @… and show thread refs as their title.
    const stripped = s
      .replace(/nostr:(?:npub1|nprofile1)[a-z0-9]+/gi, "@…")
      .replace(
        new RegExp(ENTITY_PATTERN, "gi"),
        (_m, entity) =>
          resolvedTitles[entity.toLowerCase()] ?? shortNostrEntity(entity),
      );
    const t = stripped.replace(/\s+/g, " ").trim();
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
      await withJoin(activeGroup.id, async () => {
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
      // Re-enable runs first, then focus lands on the now-interactive textarea.
      tick().then(() => inputEl?.focus({ caretAtEnd: true }));
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
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
    if (openMenuId) openMenuId = null;
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
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") openMenuId = null;
    }
    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", onKey);
    };
  });
</script>

<aside
  bind:this={asideEl}
  class="flex-1 flex-col bg-white px-4 pt-4 pb-20 min-[1540px]:rounded-tr-xl md:absolute md:top-6 md:right-0 md:z-10 md:h-[calc(100%-1.5rem)] md:flex-none md:rounded-tl-xl md:px-6 md:py-6 md:transition-all md:duration-200 dark:bg-neutral-900
		{mobileActive ? 'flex' : 'hidden'} md:flex
		{expanded ? 'md:w-150 md:shadow-2xl' : 'md:w-80 md:shadow-lg'}"
>
  <div class="mb-6 flex shrink-0 items-center justify-between">
    <span class="text-accent text-[1.5rem] leading-7">Chat</span>
    <button
      onclick={onToggle}
      class="hidden rounded bg-neutral-100 transition-colors hover:bg-neutral-200 md:block dark:bg-neutral-800 dark:hover:bg-neutral-700"
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
    class="no-scrollbar -mr-6 flex flex-1 flex-col overflow-y-auto pr-6"
  >
    {#if messages.length === 0}
      <div
        class="m-auto py-8 text-center text-sm text-neutral-400 dark:text-neutral-500"
      >
        No messages yet.
      </div>
    {:else}
      <div class="mt-auto space-y-5 pb-4">
        {#each messages as msg, i (msg.id)}
          {@const author = resolveAuthor(msg.pubkey)}
          {@const parent = msg.replyToId ? getChatMessage(msg.replyToId) : null}
          {@const parentAuthor = parent ? resolveAuthor(parent.pubkey) : null}
          {#if isNewDay(msg.createdAt, messages[i - 1]?.createdAt)}
            <div
              class="flex items-center gap-3 text-xs text-neutral-400 dark:text-neutral-300"
            >
              <span class="h-px flex-1 bg-neutral-200 dark:bg-neutral-500"
              ></span>
              <span>{formatDay(msg.createdAt)}</span>
              <span class="h-px flex-1 bg-neutral-200 dark:bg-neutral-500"
              ></span>
            </div>
          {/if}
          <div>
            <div class="mb-1 flex items-center gap-2">
              {#if author.picture}
                <img
                  src={author.picture}
                  alt=""
                  class="h-6 w-6 shrink-0 rounded-full object-cover"
                />
              {:else}
                <span
                  class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400"
                >
                  {author.name[0].toUpperCase()}
                </span>
              {/if}
              <span class="font-medium text-neutral-500 dark:text-neutral-400"
                >{author.name}</span
              >
              <div class="ml-auto flex items-center gap-1">
                <div class="relative">
                  <button
                    onclick={(e) => toggleMenu(msg.id, e)}
                    class="flex items-center justify-center rounded p-0.5 text-neutral-300 transition-colors hover:bg-neutral-100 hover:text-neutral-500 dark:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-400"
                    aria-label="Message actions"
                    aria-haspopup="menu"
                    aria-expanded={openMenuId === msg.id}
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
                  {#if openMenuId === msg.id && menuPos}
                    <div
                      role="menu"
                      style={`${menuPos.top !== undefined ? `top:${menuPos.top}px` : `bottom:${menuPos.bottom}px`};right:${menuPos.right}px`}
                      class="fixed z-50 w-36 rounded-lg border border-neutral-100 bg-white py-1 text-sm shadow-lg dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <button
                        role="menuitem"
                        onclick={(e) => {
                          e.stopPropagation();
                          startReply(msg);
                        }}
                        class="w-full px-3 py-1.5 text-left hover:bg-neutral-50 dark:text-neutral-100 dark:hover:bg-neutral-800"
                        >Reply</button
                      >
                      {#if canModerate}
                        <button
                          role="menuitem"
                          onclick={(e) => {
                            e.stopPropagation();
                            requestDeleteMessage(msg);
                          }}
                          class="w-full px-3 py-1.5 text-left text-red-600 hover:bg-red-50 dark:hover:bg-neutral-800"
                          >Delete</button
                        >
                      {/if}
                    </div>
                  {/if}
                </div>
                <span class="text-xs text-neutral-400 dark:text-neutral-500"
                  >{formatTime(msg.createdAt)}</span
                >
              </div>
            </div>
            <div class="mt-0.5">
              {#if msg.replyToId}
                <div
                  class="mb-1 border-l-2 border-neutral-300 pl-2 text-xs text-neutral-500 dark:border-neutral-600 dark:text-neutral-400"
                >
                  {#if parent}
                    <span class="font-medium">{parentAuthor?.name}</span>:
                    {truncate(parent.content)}
                  {:else}
                    <span class="italic">Replying to a message</span>
                  {/if}
                </div>
              {/if}
              <p class="leading-5 text-neutral-700 dark:text-neutral-300">
                <ChatContent content={msg.content} {profiles} />
              </p>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <div class="border-t border-neutral-200 pt-4 dark:border-neutral-700">
    {#if replyTarget}
      {@const replyAuthor = resolveAuthor(replyTarget.pubkey)}
      <div
        class="mb-2 flex items-start gap-2 rounded bg-neutral-50 px-2 py-1.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
      >
        <div class="min-w-0 flex-1">
          <span class="text-neutral-400 dark:text-neutral-500"
            >↳ Reply to
          </span>
          <span class="font-medium">{replyAuthor.name}</span>:
          <span class="text-neutral-500 dark:text-neutral-400"
            >{truncate(replyTarget.content, 80)}</span
          >
        </div>
        <button
          onclick={cancelReply}
          class="shrink-0 text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-400"
          aria-label="Cancel reply"
        >
          ✕
        </button>
      </div>
    {/if}
    {#if sendError}
      <div
        class="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700"
      >
        {sendError}
      </div>
    {/if}
    {#if joinToChat}
      <button
        onclick={onJoinToChat}
        class="bg-accent hover:bg-accent-hover w-full rounded px-3 py-2 text-sm font-medium text-white"
      >
        Join to chat
      </button>
    {:else}
      <div class="relative">
        <MentionAutocomplete
          bind:this={inputEl}
          bind:value={inputValue}
          onkeydown={onKeydown}
          rows={1}
          autoGrow
          maxRows={10}
          disabled={sending}
          placeholder={auth.user ? "Message..." : "Login to send messages"}
          {contextPubkeys}
          textareaClass="block w-full resize-none rounded border border-neutral-200 dark:border-neutral-700 py-2 pl-3 pr-11 text-sm focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
        />
        <button
          type="button"
          onclick={submit}
          disabled={sending || !inputValue.trim()}
          title="Send (⌘/Ctrl + Enter)"
          aria-label="Send message"
          class="bg-accent hover:bg-accent-hover absolute right-1.5 bottom-1.5 flex h-6 w-6 items-center justify-center rounded-full text-white transition-colors disabled:cursor-not-allowed disabled:bg-transparent disabled:opacity-40"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 -translate-x-px translate-y-px"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    {/if}
  </div>
</aside>
