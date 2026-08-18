import { browser } from "$app/environment";
import { error } from "@sveltejs/kit";
import type { NostrUser } from "$lib/gadgets";
import type { GroupMetadata, GroupSummary } from "./groups";
import type { Resource } from "./resources";
import type { Partial } from "./partials";
import type { SortMode, ThreadPage } from "./threads";
import type { Overview } from "./overview";

// What the server rendered a page with. Stores treat these as the baseline
// (see the `page.data` fallbacks) until their own live fetch lands.
export type ForumShell = {
  group: GroupMetadata | null; // simple mode
  groups: GroupSummary[]; // full mode
  adminsByRoom: Record<string, string[]>; // full mode
  admins: string[]; // the trust gate for resources and partials
  resources: Resource[];
  partials: Partial[];
};

export type Profiles = Record<string, NostrUser>;

export type ThreadsSnapshot = ThreadPage & {
  groupId: string;
  sort: SortMode;
  snapshotAt: number;
  profiles: Profiles;
};

export type OverviewSnapshot = Overview & {
  roomIds: string[];
  profiles: Profiles;
};

type Fetch = typeof fetch;

// Read a snapshot endpoint. On the server the response is inlined into the
// HTML; in the browser it is consumed only while hydrating that HTML. Client
// navigations get null, leaving the stores to fetch live (and authenticated)
// data as they always did — the same path a client-only build takes.
// A 404 from the endpoint becomes a real 404 page on the server, so crawlers
// never index an empty shell; the client keeps its own not-found handling.
export async function snapshot<T>(
  fetch: Fetch,
  url: string,
): Promise<T | null> {
  if (browser && !hasInlinedResponse(url)) return null;
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return null;
  }
  if (res.status === 404 && !browser) error(404, "Not found");
  if (!res.ok) return null;
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// SvelteKit inlines each SSR fetch as a script tag keyed by URL and removes
// it once replayed, so its presence marks the hydration pass.
function hasInlinedResponse(url: string): boolean {
  return !!document.querySelector(
    `script[data-sveltekit-fetched][data-url=${JSON.stringify(url)}]`,
  );
}
