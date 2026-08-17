import { snapshot, type OverviewSnapshot } from "$lib/forum/snapshot";

// Articles show the latest-discussions panel next to the text.
export async function load({ fetch }) {
  const overview = await snapshot<OverviewSnapshot>(fetch, "/api/overview");
  return { overview, profiles: overview?.profiles ?? null };
}
