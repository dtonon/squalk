import { MODE, GROUP_ID } from "$lib/config";
import { fetchGroups } from "$lib/forum/groups";
import { snapshotHandler } from "$lib/ssr/endpoint";
import { forumQuery } from "$lib/ssr/relay";
import { loadShell } from "$lib/ssr/shell";
import type { RequestHandler } from "./$types";

const THREADS_PER_ROOM = 1000;

type Entry = { path: string; lastmod?: number };

function xml(origin: string, entries: Entry[]): string {
  const items = entries.map((e) => {
    const loc = `<loc>${origin}${e.path}</loc>`;
    const mod = e.lastmod
      ? `<lastmod>${new Date(e.lastmod * 1000).toISOString()}</lastmod>`
      : "";
    return `<url>${loc}${mod}</url>`;
  });
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    items.join("") +
    "</urlset>"
  );
}

// Public pages only: rooms the anonymous server can see, their threads, and
// the admin-authored resources.
export const GET: RequestHandler = snapshotHandler(async ({ url }) => {
  const entries: Entry[] = [{ path: "/" }, { path: "/contacts" }];
  const shell = await loadShell();
  const admins = new Set(shell.admins);
  for (const r of shell.resources) {
    if (admins.has(r.pubkey))
      entries.push({ path: `/resource/${r.slug}`, lastmod: r.createdAt });
  }
  const roomIds =
    MODE === "full"
      ? (await fetchGroups(forumQuery))
          .filter((g) => !g.flags.includes("private"))
          .map((g) => g.id)
      : [GROUP_ID];
  for (const id of roomIds) {
    if (MODE === "full") entries.push({ path: `/room/${id}` });
    const ops = await forumQuery({
      kinds: [11],
      "#h": [id],
      limit: THREADS_PER_ROOM,
    });
    for (const e of ops)
      entries.push({ path: `/thread/${e.id}`, lastmod: e.created_at });
  }
  return new Response(xml(url.origin, entries), {
    headers: { "content-type": "application/xml" },
  });
});
