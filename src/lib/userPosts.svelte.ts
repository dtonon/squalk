import { GROUP_ID, MODE } from "$lib/config";
import { queryForum } from "$lib/relay";
import {
  fetchUserPosts,
  fetchUserPostPage,
  nextCursor,
  type UserPostKind,
  type UserPosts,
} from "$lib/forum/userPosts";

export type { UserPosts, UserPostKind };

const scope = () => (MODE === "simple" ? GROUP_ID : undefined);

let pubkey = $state<string | null>(null);
let posts = $state<UserPosts | null>(null);
let loadingMore = $state<Record<UserPostKind, boolean>>({
  roots: false,
  replies: false,
});
let initial: Promise<void> | null = null;

// Posts of the profile last loaded. Consumers check `pubkey` against the
// page's, so a stale result never shows under another user's name.
export const userPostsStore = {
  get pubkey() {
    return pubkey;
  },
  get posts() {
    return posts;
  },
  get loadingMore() {
    return loadingMore;
  },
};

export function loadUserPosts(pk: string): Promise<void> {
  pubkey = pk;
  posts = null;
  loadingMore = { roots: false, replies: false };
  initial = (async () => {
    let result: UserPosts = {
      roots: { items: [], done: true },
      replies: { items: [], done: true },
    };
    try {
      result = await fetchUserPosts(queryForum, pk, scope());
    } catch (e) {
      console.error("[profile] failed to load posts", e);
    }
    if (pubkey === pk) posts = result;
  })();
  return initial;
}

// Append the next page of one column. Waits for the initial load when the
// page still shows the server snapshot.
export async function loadMoreUserPosts(kind: UserPostKind): Promise<void> {
  const pk = pubkey;
  if (!pk || loadingMore[kind]) return;
  loadingMore[kind] = true;
  try {
    await initial;
    const current = posts?.[kind];
    if (!posts || !current || current.done || pubkey !== pk) return;
    const next = await fetchUserPostPage(queryForum, pk, kind, {
      groupId: scope(),
      until: nextCursor(current),
      exclude: new Set(current.items.map((p) => p.id)),
    });
    if (pubkey !== pk) return;
    posts[kind] = {
      items: [...current.items, ...next.items],
      done: next.done,
    };
  } catch (e) {
    console.error("[profile] failed to load more posts", e);
  } finally {
    loadingMore[kind] = false;
  }
}
