import { json } from "@sveltejs/kit";
import { fetchProfiles } from "$lib/forum/profiles";
import { snapshotHandler } from "$lib/ssr/endpoint";
import { loadShell } from "$lib/ssr/shell";
import { profileQuery } from "$lib/ssr/relay";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = snapshotHandler(async () => {
  const shell = await loadShell();
  return json({ profiles: await fetchProfiles(profileQuery, shell.admins) });
});
