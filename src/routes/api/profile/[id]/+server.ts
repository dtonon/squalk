import { error, json } from "@sveltejs/kit";
import { CACHE_CONTROL, GROUP_ID, MODE } from "$lib/config";
import { decodeProfileId, fetchProfiles } from "$lib/forum/profiles";
import { fetchUserPosts } from "$lib/forum/userPosts";
import { forumQuery, profileQuery } from "$lib/ssr/relay";

export async function GET({ params, setHeaders }) {
  setHeaders({ "cache-control": CACHE_CONTROL });
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
}
