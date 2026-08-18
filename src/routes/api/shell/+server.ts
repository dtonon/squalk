import { json } from "@sveltejs/kit";
import { CACHE_CONTROL } from "$lib/config";
import { loadShell } from "$lib/ssr/shell";

export async function GET({ setHeaders }) {
  setHeaders({ "cache-control": CACHE_CONTROL });
  return json(await loadShell());
}
