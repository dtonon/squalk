import { browser } from "$app/environment";
import { error } from "@sveltejs/kit";
import { snapshot, type OverviewSnapshot } from "$lib/forum/snapshot";

// Articles show the latest-discussions panel next to the text. An unknown
// slug is a real 404 on the server; the client keeps its in-page message.
export async function load({ fetch, params, parent }) {
  if (!browser) {
    const { shell } = await parent();
    const known = shell?.resources.some(
      (r) => r.slug === params.slug && shell.admins.includes(r.pubkey),
    );
    if (shell && !known) error(404, "Not found");
  }
  const overview = await snapshot<OverviewSnapshot>(fetch, "/api/overview");
  return { overview, profiles: overview?.profiles ?? null };
}
