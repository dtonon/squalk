import { SSR_ENABLED } from "$lib/config";
import { snapshot, type ForumShell } from "$lib/forum/snapshot";

export const ssr = SSR_ENABLED;

export async function load({ fetch }) {
  return { shell: await snapshot<ForumShell>(fetch, "/api/shell") };
}
