import { error, json } from "@sveltejs/kit";
import { MODE, GROUP_ID, CACHE_CONTROL } from "$lib/config";
import { fetchGroups } from "$lib/forum/groups";
import {
  fetchThreadPage,
  threadPagePubkeys,
  type SortMode,
} from "$lib/forum/threads";
import { fetchProfiles } from "$lib/forum/profiles";
import type { ThreadsSnapshot } from "$lib/forum/snapshot";
import { forumQuery, profileQuery } from "$lib/ssr/relay";

// First page of a group's listing. Unknown rooms are a 404 so crawlers don't
// index empty shells; private rooms are simply empty to the anonymous server.
export async function GET({ params, url, setHeaders }) {
  setHeaders({ "cache-control": CACHE_CONTROL });
  const groupId = params.group;
  if (MODE === "simple") {
    if (groupId !== GROUP_ID) error(404, "Not found");
  } else {
    const groups = await fetchGroups(forumQuery);
    if (!groups.some((g) => g.id === groupId)) error(404, "Not found");
  }
  const sort: SortMode =
    url.searchParams.get("sort") === "new" ? "new" : "active";
  const snapshotAt = Math.floor(Date.now() / 1000);
  const page = await fetchThreadPage(forumQuery, groupId, {
    sort,
    until: snapshotAt,
    snapshotAt,
  });
  const profiles = await fetchProfiles(
    profileQuery,
    threadPagePubkeys(page.threads),
  );
  const body: ThreadsSnapshot = {
    groupId,
    sort,
    snapshotAt,
    ...page,
    profiles,
  };
  return json(body);
}
