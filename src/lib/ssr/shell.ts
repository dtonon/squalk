import { MODE, GROUP_ID } from "$lib/config";
import { fetchGroup, fetchGroups, fetchRoomAdmins } from "$lib/forum/groups";
import { fetchResources } from "$lib/forum/resources";
import { fetchPartials } from "$lib/forum/partials";
import type { ForumShell } from "$lib/forum/snapshot";
import { forumQuery } from "./relay";

// Everything the layout needs on every page: the group(s), the admin set,
// sidebar resources and partials.
export async function loadShell(): Promise<ForumShell> {
  const [group, groups, resources, partials] = await Promise.all([
    MODE === "simple" ? fetchGroup(forumQuery, GROUP_ID) : null,
    MODE === "full" ? fetchGroups(forumQuery) : [],
    fetchResources(forumQuery),
    fetchPartials(forumQuery),
  ]);
  const adminsByRoom =
    MODE === "full"
      ? await fetchRoomAdmins(
          forumQuery,
          groups.map((g) => g.id),
        )
      : {};
  const admins =
    MODE === "full"
      ? [...new Set(Object.values(adminsByRoom).flat())]
      : (group?.admins ?? []);
  return { group, groups, adminsByRoom, admins, resources, partials };
}
