import { error, json } from "@sveltejs/kit";
import { GROUP_ID, CACHE_CONTROL } from "$lib/config";
import { fetchThread, threadAuthors } from "$lib/forum/thread";
import { fetchProfiles } from "$lib/forum/profiles";
import { forumQuery, profileQuery } from "$lib/ssr/relay";

export async function GET({ params, setHeaders }) {
  setHeaders({ "cache-control": CACHE_CONTROL });
  if (!/^[0-9a-f]{64}$/.test(params.id)) error(404, "Not found");
  const thread = await fetchThread(forumQuery, params.id, GROUP_ID);
  if (!thread) error(404, "Not found");
  const profiles = await fetchProfiles(profileQuery, threadAuthors(thread));
  return json({ thread, profiles });
}
