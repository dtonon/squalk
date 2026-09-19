import { json } from "@sveltejs/kit";
import { MODE, GROUP_ID } from "$lib/config";
import { fetchGroups } from "$lib/forum/groups";
import { fetchOverview, overviewPubkeys } from "$lib/forum/overview";
import { fetchProfiles } from "$lib/forum/profiles";
import type { OverviewSnapshot } from "$lib/forum/snapshot";
import { snapshotHandler } from "$lib/ssr/endpoint";
import { forumQuery, profileQuery } from "$lib/ssr/relay";
import type { RequestHandler } from "./$types";

// Room activity and the latest discussions: every room in full mode, the
// single group in simple mode (mirrors LatestDiscussions' own room set).
export const GET: RequestHandler = snapshotHandler(async () => {
  const roomIds =
    MODE === "full"
      ? (await fetchGroups(forumQuery)).map((g) => g.id)
      : [GROUP_ID];
  const overview = await fetchOverview(forumQuery, roomIds);
  const profiles = await fetchProfiles(profileQuery, overviewPubkeys(overview));
  const body: OverviewSnapshot = { roomIds, ...overview, profiles };
  return json(body);
});
