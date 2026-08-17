import { json } from "@sveltejs/kit";
import { loadShell } from "$lib/ssr/shell";

export async function GET() {
  return json(await loadShell());
}
