import { GROUP_ID, MODE } from "$lib/config";
import { queryForum } from "$lib/relay";
import { fetchUserPosts, type UserPosts } from "$lib/forum/userPosts";

export type { UserPosts };

let pubkey = $state<string | null>(null);
let posts = $state<UserPosts | null>(null);

// Posts of the profile last loaded. Consumers check `pubkey` against the
// page's, so a stale result never shows under another user's name.
export const userPostsStore = {
  get pubkey() {
    return pubkey;
  },
  get posts() {
    return posts;
  },
};

export async function loadUserPosts(pk: string) {
  pubkey = pk;
  posts = null;
  let result: UserPosts = { roots: [], replies: [] };
  try {
    result = await fetchUserPosts(
      queryForum,
      pk,
      MODE === "simple" ? GROUP_ID : undefined,
    );
  } catch (e) {
    console.error("[profile] failed to load posts", e);
  }
  if (pubkey === pk) posts = result;
}
