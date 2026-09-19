import { browser } from "$app/environment";
import { CACHE_CONTROL, SSR_ENABLED } from "$lib/config";
import { snapshot, type ForumShell } from "$lib/forum/snapshot";

export const ssr = SSR_ENABLED;

// Runs for every page, so the cache policy for rendered HTML is set here. A
// page rendered without its shell (relay down or refusing anonymous reads) is
// an empty placeholder the client fills in, not worth keeping in a shared cache.
export async function load({ fetch, setHeaders }) {
  const shell = await snapshot<ForumShell>(fetch, "/api/shell");
  if (!browser)
    setHeaders({ "cache-control": shell ? CACHE_CONTROL : "no-store" });
  return { shell };
}
