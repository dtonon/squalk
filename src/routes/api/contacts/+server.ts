import { json } from "@sveltejs/kit";
import { CACHE_CONTROL } from "$lib/config";
import { fetchProfiles } from "$lib/forum/profiles";
import { loadShell } from "$lib/ssr/shell";
import { profileQuery } from "$lib/ssr/relay";

export async function GET({ setHeaders }) {
  setHeaders({ "cache-control": CACHE_CONTROL });
  const shell = await loadShell();
  return json({ profiles: await fetchProfiles(profileQuery, shell.admins) });
}
