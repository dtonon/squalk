<script lang="ts">
  import { page } from "$app/state";
  import { resourcesStore } from "$lib/resources.svelte";
  import { adminPubkeys } from "$lib/admins.svelte";
  import PostContent from "$lib/components/PostContent.svelte";

  const slug = $derived(page.params.slug ?? "");
  const resource = $derived(resourcesStore.list.find((r) => r.slug === slug));
  // The list is admin-filtered, so a verdict needs both fetches in.
  const ready = $derived(resourcesStore.loaded && adminPubkeys.loaded);
  const notFound = $derived(ready && !resource);

  // First non-empty line of the body, trimmed of markdown markers, for SEO.
  const description = $derived(
    (resource?.content ?? "")
      .replace(/^#+\s*/gm, "")
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean)
      ?.slice(0, 160) ?? "",
  );
</script>

<svelte:head>
  <title>{resource?.title ?? "Resource"}</title>
  {#if description}
    <meta name="description" content={description} />
  {/if}
</svelte:head>

<div class="mx-auto max-w-6xl">
  <a
    href="/"
    class="mb-1 inline-flex items-center gap-1 text-sm text-neutral-400 hover:text-brand"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M15.75 19.5 8.25 12l7.5-7.5"
      />
    </svg>
    Home
  </a>

  {#if resource}
    <div class="mt-2">
      <PostContent content={resource.content} headingOffset={0} />
    </div>
  {:else if notFound}
    <p class="py-12 text-center text-neutral-400">Resource not found.</p>
  {:else}
    <p class="py-12 text-center text-neutral-400">Loading…</p>
  {/if}
</div>
