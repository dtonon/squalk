import { json } from "@sveltejs/kit";
import { snapshotHandler } from "$lib/ssr/endpoint";
import { loadShell } from "$lib/ssr/shell";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = snapshotHandler(async () =>
  json(await loadShell()),
);
