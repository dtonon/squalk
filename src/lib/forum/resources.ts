import { tag, type Query } from "./query";

export type Resource = {
  id: string;
  slug: string; // NIP-23 `d` tag — also the resource URL slug
  title: string;
  content: string; // markdown body
  position?: number;
  pubkey: string;
  createdAt: number;
};

// Positioned resources first (ascending), then alphabetical by title.
function compare(a: Resource, b: Resource): number {
  const ap = a.position;
  const bp = b.position;
  if (ap !== undefined && bp !== undefined)
    return ap !== bp ? ap - bp : a.title.localeCompare(b.title);
  if (ap !== undefined) return -1;
  if (bp !== undefined) return 1;
  return a.title.localeCompare(b.title);
}

// Every `squalk-resource` article, newest per slug. Not admin-filtered: the
// caller applies the admin set, which may resolve later than this fetch.
export async function fetchResources(q: Query): Promise<Resource[]> {
  const events = await q({ kinds: [30023], "#t": ["squalk-resource"] });
  const bySlug = new Map<string, Resource>();
  for (const e of events) {
    const slug = tag(e, "d");
    if (!slug) continue;
    const existing = bySlug.get(slug);
    if (existing && existing.createdAt >= e.created_at) continue;
    const posTag = tag(e, "position");
    const pos = posTag !== undefined ? Number(posTag) : NaN;
    bySlug.set(slug, {
      id: e.id,
      slug,
      title: tag(e, "title") ?? slug,
      content: e.content,
      position: Number.isFinite(pos) ? pos : undefined,
      pubkey: e.pubkey,
      createdAt: e.created_at,
    });
  }
  return [...bySlug.values()].sort(compare);
}
