<script lang="ts">
  import { page } from "$app/state";
  import { resourcesStore } from "$lib/resources.svelte";
  import { adminPubkeys } from "$lib/admins.svelte";
  import PostContent from "$lib/components/PostContent.svelte";
  import Meta from "$lib/components/Meta.svelte";
  import { excerpt } from "$lib/seo";

  const slug = $derived(page.params.slug ?? "");
  const resource = $derived(resourcesStore.list.find((r) => r.slug === slug));
  // The list is admin-filtered, so a verdict needs both fetches in.
  const ready = $derived(resourcesStore.loaded && adminPubkeys.loaded);
  const notFound = $derived(ready && !resource);

  const description = $derived(excerpt(resource?.content ?? ""));
</script>

<Meta title={resource?.title ?? "Resource"} {description} type="article" />

<div class="mx-auto max-w-6xl">
  <a
    href="/"
    class="hover:text-accent mb-1 inline-flex items-center gap-1 text-sm text-neutral-400 dark:text-neutral-500"
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
    <p class="py-12 text-center text-neutral-400 dark:text-neutral-500">
      Resource not found.
    </p>
  {:else}
    <p class="py-12 text-center text-neutral-400 dark:text-neutral-500">
      Loading…
    </p>
  {/if}
</div>
