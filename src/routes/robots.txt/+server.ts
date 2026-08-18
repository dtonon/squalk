import { SSR_ENABLED } from "$lib/config";

// Static builds bake it in at build time (no sitemap to point at); the server
// build answers live so the sitemap URL carries the real origin.
export const prerender = !SSR_ENABLED;

export function GET({ url }) {
  const lines = ["User-agent: *", "Disallow:"];
  if (SSR_ENABLED) lines.push(`Sitemap: ${url.origin}/sitemap.xml`);
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/plain" },
  });
}
