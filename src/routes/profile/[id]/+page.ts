import { redirect } from "@sveltejs/kit";
import * as nip19 from "@nostr/tools/nip19";
import { decodeProfileId } from "$lib/forum/profiles";
import { snapshot, type Profiles } from "$lib/forum/snapshot";
import type { UserPosts } from "$lib/forum/userPosts";

// nprofile and hex forms redirect to the canonical npub URL. An invalid id
// is a server 404 (via the endpoint) and an in-page message on the client.
export async function load({ fetch, params }) {
  const pubkey = decodeProfileId(params.id);
  if (pubkey) {
    const npub = nip19.npubEncode(pubkey);
    if (params.id !== npub) redirect(301, `/profile/${npub}`);
  }
  const data = await snapshot<{ posts: UserPosts; profiles: Profiles }>(
    fetch,
    `/api/profile/${params.id}`,
  );
  return {
    pubkey,
    posts: data?.posts ?? null,
    profiles: data?.profiles ?? null,
  };
}
