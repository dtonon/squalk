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
export const JOINCODE_REQUIRED = env.PUBLIC_JOINCODE === "yes";
export const LABELS = (env.PUBLIC_LABELS ?? "")
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);
export const BLOSSOM_URL = (env.PUBLIC_BLOSSOM_URL ?? "").replace(/\/$/, "");

// Theme color overrides: when set, replace the accent (primary) and secondary
// CSS variables defined in layout.css. Hover shades are derived in the layout.
export const ACCENT_COLOR = env.PUBLIC_ACCENT_COLOR ?? "";
export const SECONDARY_COLOR = env.PUBLIC_SECONDARY_COLOR ?? "";
