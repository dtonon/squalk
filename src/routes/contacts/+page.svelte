<script lang="ts">
  import * as nip19 from "@nostr/tools/nip19";
  import { groupStore } from "$lib/group.svelte";
  import { groupsStore } from "$lib/groups.svelte";
  import { roomAdminsStore, loadRoomAdmins } from "$lib/admins.svelte";
  import { MODE } from "$lib/config";
  import {
    profileStore,
    ensureProfile,
    type ProfileEntry,
  } from "$lib/profiles.svelte";

  // Full mode pulls admins from every room; simple mode uses the one group.
  $effect(() => {
    if (MODE !== "full") return;
    const ids = groupsStore.list.map((g) => g.id);
    if (ids.length > 0) loadRoomAdmins(ids);
  });

  const adminPubkeys = $derived<string[]>(
    MODE === "full"
      ? [...new Set(Object.values(roomAdminsStore.byRoom).flat())]
      : (groupStore.data?.admins ?? []),
  );

  // Group data is loaded by the layout; profiles stream in reactively.
  $effect(() => {
    for (const pk of adminPubkeys) ensureProfile(pk);
  });

  // Rooms a given admin manages (full mode only).
  function roomsOf(pk: string) {
    return groupsStore.list.filter((g) =>
      roomAdminsStore.byRoom[g.id]?.includes(pk),
    );
  }

  const loading = $derived(
    MODE === "full"
      ? !groupsStore.loaded ||
          (groupsStore.list.length > 0 && !roomAdminsStore.loaded)
      : !groupStore.data,
  );

  type Contact = { pubkey: string; npub: string; entry?: ProfileEntry };

  const contacts = $derived<Contact[]>(
    adminPubkeys.map((pk) => {
      const entry = profileStore.profiles.get(pk);
      return { pubkey: pk, npub: entry?.npub ?? nip19.npubEncode(pk), entry };
    }),
  );

  function displayName(c: Contact): string {
    return c.entry?.displayName || c.entry?.name || `${c.npub.slice(0, 12)}…`;
  }

  function websiteHref(url: string): string {
    return /^https?:\/\//i.test(url) ? url : `https://${url}`;
  }

  function websiteLabel(url: string): string {
    return url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
</script>

<svelte:head>
  <title>Contacts</title>
  <meta name="description" content="Admins and contacts for this community." />
</svelte:head>

<div class="mx-auto max-w-6xl">
  <h1 class="py-2 text-[1.65rem] text-brand">Contacts</h1>

  {#if loading}
    <p class="py-6 text-center text-neutral-400">Loading…</p>
  {:else if contacts.length === 0}
    <p class="py-6 text-center text-neutral-400">No admins listed.</p>
  {:else}
    <ul class="mt-2 space-y-3">
      {#each contacts as c (c.pubkey)}
        <li
          class="flex gap-4 rounded-lg border border-neutral-100 p-4 shadow-sm"
        >
          {#if c.entry?.picture}
            <img
              src={c.entry.picture}
              alt=""
              class="h-14 w-14 shrink-0 rounded-full object-cover"
            />
          {:else}
            <span
              class="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-lg font-semibold text-neutral-500"
            >
              {displayName(c)[0].toUpperCase()}
            </span>
          {/if}

          <div class="min-w-0 flex-1">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-2xl font-medium text-neutral-900">
                  {displayName(c)}
                </p>
                {#if c.entry?.nip05}
                  <p class="truncate text-neutral-400">
                    {c.entry.nip05}
                  </p>
                {/if}
              </div>
              <a
                href="https://njump.me/{c.npub}"
                target="_blank"
                rel="noopener noreferrer"
                class="shrink-0 text-sm text-brand hover:underline"
              >
                View profile ↗
              </a>
            </div>

            {#if c.entry?.about}
              <p class="mt-2 whitespace-pre-line text-neutral-600">
                {c.entry.about}
              </p>
            {/if}

            {#if c.entry?.website || c.entry?.lud16}
              <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                {#if c.entry?.website}
                  <a
                    href={websiteHref(c.entry.website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="truncate text-brand hover:underline"
                  >
                    {websiteLabel(c.entry.website)}
                  </a>
                {/if}
                {#if c.entry?.lud16}
                  <span class="text-neutral-500" title="Lightning address">
                    ⚡ {c.entry.lud16}
                  </span>
                {/if}
              </div>
            {/if}

            {#if MODE === "full"}
              {@const rooms = roomsOf(c.pubkey)}
              {#if rooms.length > 0}
                <p class="mt-2 text-neutral-500">
                  <span class="text-neutral-400">Manages:</span>
                  {#each rooms as r, i}<a
                      href="/room/{r.id}"
                      class="text-brand hover:underline">{r.name}</a
                    >{i < rooms.length - 1 ? ", " : ""}{/each}
                </p>
              {/if}
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</div>
