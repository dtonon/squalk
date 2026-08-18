<script lang="ts">
  import { page } from "$app/state";
  import { TITLE } from "$lib/config";
  import { groupStore } from "$lib/group.svelte";
  import { GROUP_ID, MODE } from "$lib/config";

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

  const siteName = $derived(
    TITLE || (MODE === "simple" ? (groupStore.data?.name ?? GROUP_ID) : ""),
  );
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
  {#if siteName}
    <meta property="og:site_name" content={siteName} />
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
