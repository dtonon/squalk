import { snapshot, type ThreadsSnapshot } from "$lib/forum/snapshot";

export async function load({ fetch, params, url }) {
  const sort = url.searchParams.get("sort") === "new" ? "?sort=new" : "";
  const threads = await snapshot<ThreadsSnapshot>(
    fetch,
    `/api/threads/${params.slug}${sort}`,
  );
  return { threads, profiles: threads?.profiles ?? null };
}
