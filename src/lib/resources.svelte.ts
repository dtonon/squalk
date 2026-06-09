import { adminPubkeys } from "$lib/admins.svelte";
import { queryForum } from "$lib/relay";

export type Resource = {
  id: string;
  slug: string; // NIP-23 `d` tag — also the resource URL slug
  title: string;
  content: string; // markdown body
  position?: number;
  pubkey: string;
  createdAt: number;
};

let all = $state<Resource[]>([]);
let loaded = $state(false);

export const resourcesStore = {
  // Only resources authored by an admin are surfaced; the relay query is
  // open, so the trusted admin set is the gate.
  get list() {
    const admins = new Set(adminPubkeys.list);
    return all.filter((r) => admins.has(r.pubkey));
  },
  get loaded() {
    return loaded;
  },
};

// Positioned resources come first by ascending `position`; the rest follow
// alphabetically by title. Equal positions fall back to title order.
function compare(a: Resource, b: Resource): number {
  const ap = a.position;
  const bp = b.position;
  if (ap !== undefined && bp !== undefined)
    return ap !== bp ? ap - bp : a.title.localeCompare(b.title);
  if (ap !== undefined) return -1;
  if (bp !== undefined) return 1;
  return a.title.localeCompare(b.title);
}

// Resources are kind 30023 (NIP-23 long-form) tagged ["t", "squalk-resource"].
export async function loadResources() {
  try {
    const events = await queryForum({
      kinds: [30023],
      "#t": ["squalk-resource"],
    });
    // Addressable events: keep the newest per `d` slug.
    const bySlug = new Map<string, Resource>();
    for (const e of events) {
      const slug = e.tags.find((t) => t[0] === "d")?.[1];
      if (!slug) continue;
      const existing = bySlug.get(slug);
      if (existing && existing.createdAt >= e.created_at) continue;
      const posTag = e.tags.find((t) => t[0] === "position")?.[1];
      const pos = posTag !== undefined ? Number(posTag) : NaN;
      bySlug.set(slug, {
        id: e.id,
        slug,
        title: e.tags.find((t) => t[0] === "title")?.[1] ?? slug,
        content: e.content,
        position: Number.isFinite(pos) ? pos : undefined,
        pubkey: e.pubkey,
        createdAt: e.created_at,
      });
    }
    all = [...bySlug.values()].sort(compare);
  } finally {
    loaded = true;
  }
}
