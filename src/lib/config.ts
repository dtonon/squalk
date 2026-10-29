import { env } from "$env/dynamic/public";
import { readSetup } from "$lib/setup";

// Server-side rendering: opt-in, decided at build time (vite.config.ts bakes
// PUBLIC_SSR in; svelte.config.js picks the matching adapter).
export const SSR_ENABLED = __SQUALK_SSR__;

// Dynamic mode: no configured relay, the visitor picks one at startup (see
// setup.ts) and the app behaves as full mode on it. Client-only by nature.
export const DYNAMIC = env.PUBLIC_MODE === "dynamic";
if (DYNAMIC && SSR_ENABLED) {
  throw new Error("PUBLIC_MODE=dynamic requires PUBLIC_SSR=no");
}
export const MODE: "simple" | "full" =
  env.PUBLIC_MODE === "full" || DYNAMIC ? "full" : "simple";

// Optional vars are read dynamically so an unset one is undefined and falls
// back to its default instead of breaking the static-import contract.
const setup = readSetup();
export const RELAY_URL = DYNAMIC ? setup.relay : (env.PUBLIC_RELAY_URL ?? "");
if (!DYNAMIC && !RELAY_URL) {
  throw new Error("PUBLIC_RELAY_URL is required");
}
export const RELAY_HOST = RELAY_URL.replace(/^wss?:\/\//, "");
// Dynamic mode before a relay is chosen: the layout shows the setup screen and
// nothing touches the (empty) relay.
export const NEEDS_SETUP = DYNAMIC && !RELAY_URL;

export const TITLE = env.PUBLIC_TITLE ?? "";

// Required in simple mode (the single forum's group), optional in full mode
// where rooms are selected at runtime. Read dynamically so full mode can omit
// it without breaking the static-import contract.
export const GROUP_ID = env.PUBLIC_GROUP_ID ?? "";
if (MODE === "simple" && !GROUP_ID) {
  throw new Error("PUBLIC_GROUP_ID is required in simple mode");
}
// Relays used to hand a nostrconnect:// URI to a remote signer (NIP-46).
// Comma-separated override via PUBLIC_NOSTRCONNECT_RELAYS.
export const NOSTRCONNECT_RELAYS: string[] = (
  env.PUBLIC_NOSTRCONNECT_RELAYS ||
  "wss://bucket.coracle.social,wss://relay.primal.net"
)
  .split(",")
  .map((r) => r.trim())
  .filter(Boolean);
// With SSR on, a client-side navigation also asks the server for the same
// snapshot (without waiting for it) so the page is already cached for the
// next refresh, shared link or crawler. Costs one server→relay query per
// navigation; opt out with PUBLIC_SSR_WARM=no.
export const SSR_WARM = SSR_ENABLED && env.PUBLIC_SSR_WARM !== "no";
// Lifetime of server-rendered snapshots, in seconds. Within FRESH a cached
// page is served as is; up to STALE it is still served at once but refreshed
// in the background; beyond that it is fetched again before answering. Only
// crawlers and cold refreshes see the snapshot — the browser always refetches
// live data after hydration — so these trade first-paint staleness for speed.
function seconds(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
export const SSR_CACHE_FRESH = seconds(env.PUBLIC_SSR_CACHE_FRESH, 300);
export const SSR_CACHE_STALE = seconds(env.PUBLIC_SSR_CACHE_STALE, 6 * 3600);
// The same policy for a shared HTTP cache in front (Cloudflare honours it once
// HTML caching is enabled). Browsers always revalidate (max-age=0) so a login
// shows its content at once.
export const CACHE_CONTROL = `public, max-age=0, s-maxage=${SSR_CACHE_FRESH}, stale-while-revalidate=${SSR_CACHE_STALE}`;
// Requires a relay with NIP-50 support.
export const SEARCH_ENABLED = env.PUBLIC_SEARCH === "yes";
export const LABELS = (env.PUBLIC_LABELS ?? "")
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);
// Explicitly configured Blossom server. Empty means "resolve it": see
// blossom.svelte.ts.
export const BLOSSOM_URL = (env.PUBLIC_BLOSSOM_URL ?? "").replace(/\/$/, "");

// Theme color overrides: when set, replace the accent (primary) and secondary
// CSS variables defined in layout.css. Hover shades are derived in the layout.
export const ACCENT_COLOR = env.PUBLIC_ACCENT_COLOR ?? "";
export const SECONDARY_COLOR = env.PUBLIC_SECONDARY_COLOR ?? "";

// Favicon: any URL (absolute, or root-relative for a file in static/). The
// default is a ring in the accent color (a circle with a transparent hole of
// half its radius), inlined as an SVG data URI.
const DEFAULT_ACCENT = "#e32a6d";
export const FAVICON =
  env.PUBLIC_FAVICON ||
  "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill-rule="evenodd" fill="${ACCENT_COLOR || DEFAULT_ACCENT}" d="M16 0a16 16 0 1 0 0 32a16 16 0 1 0 0-32zM16 8a8 8 0 1 1 0 16a8 8 0 1 1 0-16z"/></svg>`,
    );

// External Nostr client used to open events and profiles that live outside
// the forum. {e} is replaced with the bech32 entity (npub, nevent, naddr...).
const DEFAULT_EXTERNAL_CLIENT = "https://njump.me/{e}";
export const EXTERNAL_CLIENT = env.PUBLIC_EXTERNAL_CLIENT?.includes("{e}")
  ? env.PUBLIC_EXTERNAL_CLIENT
  : DEFAULT_EXTERNAL_CLIENT;
export const EXTERNAL_CLIENT_NAME = (() => {
  try {
    return new URL(EXTERNAL_CLIENT.replace("{e}", "x")).hostname;
  } catch {
    return "external client";
  }
})();
export function externalLink(entity: string): string {
  return EXTERNAL_CLIENT.replace("{e}", entity);
}
