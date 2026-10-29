<script lang="ts">
  import ThemeToggle from "$lib/components/ThemeToggle.svelte";
  import {
    normalizeRelayUrl,
    recentRelays,
    removeRecent,
    saveSetup,
    type RecentRelay,
  } from "$lib/setup";

  // Dynamic mode's first screen: the visitor names a relay, sees what its
  // NIP-11 document says about it, and boots the forum on it. The choice is
  // stored and the page reloads, so the whole app starts with a known relay.
  type Preview = {
    name: string;
    description: string;
    icon: string;
    nips: number[] | null;
  };

  let relayInput = $state("");
  let preview = $state<Preview | null>(null);
  let checking = $state(false);
  let error = $state("");
  let submitting = $state(false);
  let recent = $state<RecentRelay[]>(recentRelays());

  const relayUrl = $derived(normalizeRelayUrl(relayInput));
  const host = $derived(relayUrl?.replace(/^wss?:\/\//, "") ?? "");
  const safeIcon = $derived(
    preview?.icon && /^https?:\/\//i.test(preview.icon) ? preview.icon : "",
  );

  // Best-effort NIP-11 preview while typing; a relay without one is still
  // usable, so a failed fetch just shows nothing.
  let previewFor = "";
  let loaded = $state("");
  let pending: Promise<void> | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    const url = relayUrl;
    if (debounce) clearTimeout(debounce);
    if (!url) {
      preview = null;
      checking = false;
      previewFor = "";
      return;
    }
    if (url === previewFor) return;
    debounce = setTimeout(() => (pending = loadPreview(url)), 400);
  });

  // Not every NIP-29 relay advertises it, so a missing or negative answer
  // only warns and the visitor can still open the forum.
  const warning = $derived.by(() => {
    if (!relayUrl || loaded !== relayUrl || checking) return "";
    if (!preview?.nips)
      return `Can't confirm that ${host} hosts groups (NIP-29).`;
    if (!preview.nips.includes(29))
      return `${host} doesn't list group support (NIP-29).`;
    return "";
  });

  async function loadPreview(url: string) {
    previewFor = url;
    checking = true;
    try {
      const { fetchRelayInformation } = await import("@nostr/tools/nip11");
      const info = await fetchRelayInformation(url);
      if (previewFor !== url) return;
      preview = {
        name: info.name ?? "",
        description: info.description ?? "",
        icon: info.icon ?? "",
        nips: Array.isArray(info.supported_nips)
          ? info.supported_nips.map(Number)
          : null,
      };
    } catch {
      if (previewFor === url) preview = null;
    } finally {
      if (previewFor === url) {
        checking = false;
        loaded = url;
      }
    }
  }

  // A plain websocket handshake, so a typo is caught here rather than on an
  // empty forum. NIP-42 and access come later, on the real connection.
  function canConnect(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        resolve(false);
        return;
      }
      const timer = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 6000);
      ws.onopen = () => {
        clearTimeout(timer);
        ws.close();
        resolve(true);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
    });
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    error = "";
    const url = relayUrl;
    if (!url) {
      error = "Enter a relay address, like relay.example.com";
      return;
    }
    submitting = true;
    // Submitted before the preview landed: check first, and stop on a warning
    // so the visitor sees it before confirming with "Open anyway".
    if (loaded !== url) {
      if (debounce) clearTimeout(debounce);
      if (previewFor !== url) pending = loadPreview(url);
      await pending;
      if (warning) {
        submitting = false;
        return;
      }
    }
    if (!(await canConnect(url))) {
      submitting = false;
      error = `Could not connect to ${host}`;
      return;
    }
    saveSetup(url, preview?.name ?? "");
    location.assign("/");
  }

  // Recent relays as a combobox dropdown on the input, filtered by its text
  const stripScheme = (u: string) => u.replace(/^wss?:\/\//, "");
  let listOpen = $state(false);
  let active = $state(-1);
  const matches = $derived.by(() => {
    const q = stripScheme(relayInput.trim().toLowerCase());
    return recent.filter(
      (r) =>
        !q ||
        stripScheme(r.url).toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q),
    );
  });
  const showList = $derived(listOpen && matches.length > 0);

  function openList() {
    listOpen = true;
    active = -1;
  }

  function pick(r: RecentRelay) {
    relayInput = r.url.startsWith("wss://") ? stripScheme(r.url) : r.url;
    listOpen = false;
    error = "";
  }

  function remove(r: RecentRelay) {
    removeRecent(r.url);
    recent = recentRelays();
    active = Math.min(active, matches.length - 1);
  }

  function onKeydown(e: KeyboardEvent) {
    const n = matches.length;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!n) return;
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      if (!showList) {
        listOpen = true;
        active = step === 1 ? 0 : n - 1;
      } else {
        active = (active + step + n) % n;
      }
    } else if (!showList || active < 0) {
      if (e.key === "Escape" && showList) {
        e.preventDefault();
        listOpen = false;
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(matches[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      listOpen = false;
    } else if (e.key === "Delete") {
      e.preventDefault();
      remove(matches[active]);
    }
  }
</script>

<svelte:head>
  <title>Squalk Playground</title>
</svelte:head>

<div class="flex min-h-dvh flex-col">
  <div class="flex justify-end p-4">
    <ThemeToggle />
  </div>
  <main
    class="flex flex-1 flex-col items-center justify-center px-6 pb-24 text-center"
  >
    <h1 class="inline-flex flex-col items-end">
      <span
        class="flex flex-col items-center gap-0 text-7xl leading-none font-bold text-neutral-900 sm:text-8xl dark:text-neutral-100"
      >
        <svg
          viewBox="0 0 32 32"
          class="text-accent h-[0.75em] w-[0.75em]"
          aria-hidden="true"
        >
          <path
            fill-rule="evenodd"
            fill="currentColor"
            d="M16 0a16 16 0 1 0 0 32a16 16 0 1 0 0-32zM16 8a8 8 0 1 1 0 16a8 8 0 1 1 0-16z"
          />
        </svg>
        Squalk
      </span>
      <span
        class="relative z-10 -mt-7 -mr-3 -rotate-6 rounded bg-neutral-700 px-2 py-0.5 text-sm font-semibold tracking-wide text-white uppercase shadow-md sm:-mt-4 dark:bg-neutral-600"
        ><span class="sr-only"> </span>Playground</span
      >
    </h1>
    <p class="mt-8 max-w-md text-neutral-600 dark:text-neutral-400">
      Squalk lets anyone
      <a
        href="https://github.com/dtonon/squalk"
        target="_blank"
        rel="noopener noreferrer"
        class="underline hover:text-neutral-900 dark:hover:text-neutral-100"
        >host their own community forum</a
      >
      on Nostr. This instance is a playground: connect to any NIP-29 community and
      explore it freely, like a generic client.
    </p>

    <form
      onsubmit={submit}
      class="mt-8 flex w-full max-w-md flex-col gap-4 text-left"
    >
      <div>
        <label
          for="relay-url"
          class="mb-1 block pl-1 text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >Enter the relay's host you want to browse</label
        >
        <div class="relative">
          <input
            id="relay-url"
            type="text"
            inputmode="url"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            placeholder="relay.example.com"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls="relay-recent"
            aria-activedescendant={showList && active >= 0
              ? `relay-recent-${active}`
              : undefined}
            bind:value={relayInput}
            onfocus={openList}
            onclick={() => (listOpen = true)}
            oninput={openList}
            onblur={() => (listOpen = false)}
            onkeydown={onKeydown}
            aria-describedby="relay-help relay-preview"
            aria-invalid={error ? "true" : undefined}
            class="focus:ring-accent block w-full rounded border border-neutral-300 bg-white px-3 py-2 text-neutral-900 focus:ring-1 focus:outline-none dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
          />
          <ul
            id="relay-recent"
            role="listbox"
            aria-label="Recent relays"
            hidden={!showList}
            class="absolute top-full right-0 left-0 z-20 mt-1 overflow-hidden rounded border border-neutral-300 bg-white py-1 shadow-lg dark:border-neutral-600 dark:bg-neutral-800"
          >
            {#each matches as r, i (r.url)}
              <li
                id="relay-recent-{i}"
                role="option"
                tabindex="-1"
                aria-selected={i === active}
                onmousedown={(e) => {
                  e.preventDefault();
                  pick(r);
                }}
                onmouseenter={() => (active = i)}
                class="flex cursor-pointer items-center gap-2 px-3 py-2 {i ===
                active
                  ? 'bg-neutral-100 dark:bg-neutral-700'
                  : ''}"
              >
                <span class="flex min-w-0 flex-1 items-baseline gap-2">
                  {#if r.name}
                    <span
                      class="truncate font-medium text-neutral-900 dark:text-neutral-100"
                      >{r.name}</span
                    >
                  {/if}
                  <span
                    class="truncate text-sm text-neutral-500 dark:text-neutral-400"
                    >{stripScheme(r.url)}</span
                  >
                </span>
                <button
                  type="button"
                  tabindex="-1"
                  aria-hidden="true"
                  title="Remove from recent relays"
                  onmousedown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    remove(r);
                  }}
                  class="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700 dark:hover:bg-neutral-600 dark:hover:text-neutral-200"
                >
                  <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" fill="none">
                    <path
                      d="M4 4l8 8M12 4l-8 8"
                      stroke="currentColor"
                      stroke-width="1.75"
                      stroke-linecap="round"
                    />
                  </svg>
                </button>
              </li>
            {/each}
          </ul>
        </div>
        <p
          id="relay-help"
          class="mt-1 pl-1 text-xs text-neutral-500 dark:text-neutral-400"
        >
          A NIP-29 relay that hosts the rooms. The scheme is optional.
          {#if recent.length}
            <span class="sr-only"
              >Recent relays open below: arrows to choose, Delete to remove one.</span
            >
          {/if}
        </p>
      </div>

      <div id="relay-preview" class="min-h-6" role="status" aria-live="polite">
        {#if checking}
          <p class="text-neutral-500 dark:text-neutral-400">Checking {host}…</p>
        {:else if preview && (preview.name || preview.description)}
          <div
            class="flex gap-3 {preview.description
              ? 'items-start'
              : 'items-center'}"
          >
            {#if safeIcon}
              <img
                src={safeIcon}
                alt=""
                class="h-10 w-10 shrink-0 rounded-full bg-neutral-200 object-cover dark:bg-neutral-700"
              />
            {/if}
            <div class="min-w-0">
              <p class="font-medium text-neutral-900 dark:text-neutral-100">
                {preview.name || host}
              </p>
              {#if preview.description}
                <p
                  class="line-clamp-3 leading-snug text-neutral-600 dark:text-neutral-400"
                >
                  {preview.description}
                </p>
              {/if}
            </div>
          </div>
        {/if}
        {#if warning}
          <p class="mt-2 text-amber-700 dark:text-amber-400">{warning}</p>
        {/if}
      </div>

      {#if error}
        <p role="alert" class="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      {/if}

      <button
        type="submit"
        disabled={submitting || !relayUrl}
        class="bg-accent hover:bg-accent-hover rounded px-6 py-2 font-medium text-white disabled:opacity-50"
      >
        {submitting ? "Connecting…" : warning ? "Open anyway" : "Open forum"}
      </button>
      <p class="text-center text-xs text-neutral-500 dark:text-neutral-400">
        Your choice is remembered on this device.
      </p>
    </form>
  </main>
</div>
