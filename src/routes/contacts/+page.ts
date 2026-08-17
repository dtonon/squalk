import {
  snapshot,
  type OverviewSnapshot,
  type Profiles,
} from "$lib/forum/snapshot";

// Admin profiles for the cards, plus the latest-discussions panel beside them.
export async function load({ fetch }) {
  const [contacts, overview] = await Promise.all([
    snapshot<{ profiles: Profiles }>(fetch, "/api/contacts"),
    snapshot<OverviewSnapshot>(fetch, "/api/overview"),
  ]);
  return {
    overview,
    profiles: { ...overview?.profiles, ...contacts?.profiles },
  };
}
