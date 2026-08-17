import { snapshot, type Profiles } from "$lib/forum/snapshot";

export async function load({ fetch }) {
  const data = await snapshot<{ profiles: Profiles }>(fetch, "/api/contacts");
  return { profiles: data?.profiles ?? null };
}
