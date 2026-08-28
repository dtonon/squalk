<script module lang="ts">
  import { TITLE, GROUP_ID, MODE } from "$lib/config";
  import { groupStore } from "$lib/group.svelte";

  // Forum name from the env, or the group name in simple mode.
  export function siteName(): string {
    return (
      TITLE || (MODE === "simple" ? (groupStore.data?.name ?? GROUP_ID) : "")
    );
  }
</script>

<script lang="ts">
  import { page } from "$app/state";

  type Props = {
    title: string;
    description?: string;
    type?: "website" | "article";
    image?: string;
    jsonLd?: Record<string, unknown>;
  };

  let {
    title,
    description = "",
    type = "website",
    image,
    jsonLd,
  }: Props = $props();

  // Escape "<" so the JSON can never close the script tag early.
  const ld = $derived(
    jsonLd ? JSON.stringify(jsonLd).replace(/</g, "\\u003c") : "",
  );

  const site = $derived(siteName());
  const canonical = $derived(page.url.origin + page.url.pathname);
</script>

<svelte:head>
  <title>{title}</title>
  <link rel="canonical" href={canonical} />
  {#if description}
    <meta name="description" content={description} />
    <meta property="og:description" content={description} />
  {/if}
  <meta property="og:title" content={title} />
  <meta property="og:type" content={type} />
  <meta property="og:url" content={canonical} />
  {#if site}
    <meta property="og:site_name" content={site} />
  {/if}
  {#if image}
    <meta property="og:image" content={image} />
  {/if}
  <meta
    name="twitter:card"
    content={image ? "summary_large_image" : "summary"}
  />
  {#if ld}
    {@html `<script type="application/ld+json">${ld}</script>`}
  {/if}
</svelte:head>
