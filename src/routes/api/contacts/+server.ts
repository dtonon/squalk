import { json } from "@sveltejs/kit";
import { fetchProfiles } from "$lib/forum/profiles";
import { loadShell } from "$lib/ssr/shell";
import { profileQuery } from "$lib/ssr/relay";

export async function GET() {
  const shell = await loadShell();
  return json({ profiles: await fetchProfiles(profileQuery, shell.admins) });
}
