<script lang="ts">
  import DiscussionsFeed from "$lib/components/DiscussionsFeed.svelte";
  import { groupsStore } from "$lib/groups.svelte";
  import { page } from "$app/state";

  // The slug is the NIP-29 group id; resolve its name from the loaded list.
  const slug = $derived(page.params.slug ?? "");
  const room = $derived(groupsStore.list.find((g) => g.id === slug));
  const title = $derived(room?.name ?? slug);
</script>

<DiscussionsFeed groupId={slug} {title} />
