import { MODE, GROUP_ID } from "$lib/config";
import {
  snapshot,
  type OverviewSnapshot,
  type ThreadsSnapshot,
} from "$lib/forum/snapshot";

// Simple mode: the single group's listing. Full mode: the room overview.
export async function load({ fetch, url }) {
  if (MODE === "simple") {
    const sort = url.searchParams.get("sort") === "new" ? "?sort=new" : "";
    const threads = await snapshot<ThreadsSnapshot>(
      fetch,
      `/api/threads/${GROUP_ID}${sort}`,
    );
    return { threads, profiles: threads?.profiles ?? null };
  }
  const overview = await snapshot<OverviewSnapshot>(fetch, "/api/overview");
  return { overview, profiles: overview?.profiles ?? null };
}
