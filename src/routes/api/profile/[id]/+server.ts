import { error, json } from "@sveltejs/kit";
import { GROUP_ID, MODE } from "$lib/config";
import { decodeProfileId, fetchProfiles } from "$lib/forum/profiles";
import { fetchUserPosts } from "$lib/forum/userPosts";
import { snapshotHandler } from "$lib/ssr/endpoint";
import { forumQuery, profileQuery } from "$lib/ssr/relay";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = snapshotHandler(async ({ params }) => {
  const pubkey = decodeProfileId(params.id);
  if (!pubkey) error(404, "Not found");
  const [profiles, posts] = await Promise.all([
    fetchProfiles(profileQuery, [pubkey]),
    fetchUserPosts(
      forumQuery,
      pubkey,
      MODE === "simple" ? GROUP_ID : undefined,
    ),
  ]);
  return json({ pubkey, posts, profiles });
});
