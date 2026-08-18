import { json } from "@sveltejs/kit";
import { MODE, GROUP_ID, CACHE_CONTROL } from "$lib/config";
import { fetchGroups } from "$lib/forum/groups";
import { fetchOverview, overviewPubkeys } from "$lib/forum/overview";
import { fetchProfiles } from "$lib/forum/profiles";
import type { OverviewSnapshot } from "$lib/forum/snapshot";
import { forumQuery, profileQuery } from "$lib/ssr/relay";

// Room activity and the latest discussions: every room in full mode, the
// single group in simple mode (mirrors LatestDiscussions' own room set).
export async function GET({ setHeaders }) {
  setHeaders({ "cache-control": CACHE_CONTROL });
  const roomIds =
    MODE === "full"
      ? (await fetchGroups(forumQuery)).map((g) => g.id)
      : [GROUP_ID];
  const overview = await fetchOverview(forumQuery, roomIds);
  const profiles = await fetchProfiles(profileQuery, overviewPubkeys(overview));
  const body: OverviewSnapshot = { roomIds, ...overview, profiles };
  return json(body);
}
