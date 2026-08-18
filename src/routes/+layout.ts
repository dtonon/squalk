import { browser } from "$app/environment";
import { CACHE_CONTROL, SSR_ENABLED } from "$lib/config";
import { snapshot, type ForumShell } from "$lib/forum/snapshot";

export const ssr = SSR_ENABLED;

// Runs for every page, so the cache policy for rendered HTML is set here.
export async function load({ fetch, setHeaders }) {
  if (!browser) setHeaders({ "cache-control": CACHE_CONTROL });
  return { shell: await snapshot<ForumShell>(fetch, "/api/shell") };
}
