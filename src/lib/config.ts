import { PUBLIC_RELAY_URL } from "$env/static/public";
import { env } from "$env/dynamic/public";

// Required: a missing relay is always a misconfiguration, so let the static
// import fail loudly (and keep it typed as string).
export const RELAY_URL = PUBLIC_RELAY_URL;

// Optional: read dynamically so an unset var is undefined and falls back to its
// default, instead of breaking the static-import contract at load time.
export const TITLE = env.PUBLIC_TITLE ?? "";
export const MODE: "simple" | "full" =
  env.PUBLIC_MODE === "full" ? "full" : "simple";

// Required in simple mode (the single forum's group), optional in full mode
// where rooms are selected at runtime. Read dynamically so full mode can omit
// it without breaking the static-import contract.
export const GROUP_ID = env.PUBLIC_GROUP_ID ?? "";
if (MODE === "simple" && !GROUP_ID) {
  throw new Error("PUBLIC_GROUP_ID is required in simple mode");
}
// Server-side rendering: opt-in, decided at build time (vite.config.ts bakes
// PUBLIC_SSR in; svelte.config.js picks the matching adapter).
export const SSR_ENABLED = __SQUALK_SSR__;
// With SSR on, a client-side navigation also asks the server for the same
// snapshot (without waiting for it) so the page is already cached for the
// next refresh, shared link or crawler. Costs one server→relay query per
// navigation; opt out with PUBLIC_SSR_WARM=no.
export const SSR_WARM = SSR_ENABLED && env.PUBLIC_SSR_WARM !== "no";
// Server-rendered pages and snapshots are anonymous, so a shared cache may
// hold them: fresh for 5 minutes, served stale for an hour while revalidating.
// Browsers always revalidate (max-age=0) so a login shows its content at once.
export const CACHE_CONTROL =
  "public, max-age=0, s-maxage=300, stale-while-revalidate=3600";
// Requires a relay with NIP-50 support.
export const SEARCH_ENABLED = env.PUBLIC_SEARCH === "yes";
export const LABELS = (env.PUBLIC_LABELS ?? "")
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);
export const BLOSSOM_URL = (env.PUBLIC_BLOSSOM_URL ?? "").replace(/\/$/, "");

// Theme color overrides: when set, replace the accent (primary) and secondary
// CSS variables defined in layout.css. Hover shades are derived in the layout.
export const ACCENT_COLOR = env.PUBLIC_ACCENT_COLOR ?? "";
export const SECONDARY_COLOR = env.PUBLIC_SECONDARY_COLOR ?? "";
