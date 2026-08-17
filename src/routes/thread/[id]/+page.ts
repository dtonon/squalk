import { snapshot, type Profiles } from "$lib/forum/snapshot";
import type { ThreadDetail } from "$lib/forum/thread";

export async function load({ fetch, params }) {
  const data = await snapshot<{ thread: ThreadDetail; profiles: Profiles }>(
    fetch,
    `/api/thread/${params.id}`,
  );
  return { thread: data?.thread ?? null, profiles: data?.profiles ?? null };
}
