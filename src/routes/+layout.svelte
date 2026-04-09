<script lang="ts">
  import "./layout.css";
  import favicon from "$lib/assets/favicon.svg";
  import Navbar from "$lib/components/Navbar.svelte";
  import LeftSidebar from "$lib/components/LeftSidebar.svelte";
  import ChatSidebar from "$lib/components/ChatSidebar.svelte";
  import LoginModal from "$lib/components/LoginModal.svelte";
  import JoinModal from "$lib/components/JoinModal.svelte";
  import NewDiscussionModal from "$lib/components/NewDiscussionModal.svelte";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { restoreSession } from "$lib/auth.svelte";
  import { loadGroup } from "$lib/group.svelte";
  import { MODE } from "$lib/config";

  let { children } = $props();

  const mode = MODE;
  const chatEnabled = true;

  onMount(() => {
    restoreSession();
    loadGroup();
  });

  let chatExpanded = $state(false);

  const activeRoom = $derived(page.params.slug ?? "");
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

<div class="flex h-screen flex-col overflow-hidden max-w-[1540px] mx-auto">
  <Navbar />
  <div class="relative flex flex-1 gap-5 overflow-hidden pt-2">
    <LeftSidebar {mode} {activeRoom} />
    <main class="flex-1 overflow-y-auto rounded-t-xl bg-white px-10 pt-6 pb-20">
      {@render children()}
    </main>
    {#if chatEnabled}
      <div class="shrink-0 w-80" aria-hidden="true"></div>
      <ChatSidebar
        expanded={chatExpanded}
        onToggle={() => (chatExpanded = !chatExpanded)}
      />
    {/if}
  </div>
</div>

<LoginModal />
<JoinModal />
<NewDiscussionModal />
