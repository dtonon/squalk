import { PUBLIC_RELAY_URL, PUBLIC_GROUP_ID } from "$env/static/public";
import { env } from "$env/dynamic/public";

// Required: a missing relay or group id is a misconfiguration, so let the
// static import fail loudly (and keep them typed as string).
export const RELAY_URL = PUBLIC_RELAY_URL;
export const GROUP_ID = PUBLIC_GROUP_ID;

// Optional: read dynamically so an unset var is undefined and falls back to its
// default, instead of breaking the static-import contract at load time.
export const TITLE = env.PUBLIC_TITLE ?? "";
export const MODE: "simple" | "full" =
  env.PUBLIC_MODE === "full" ? "full" : "simple";
export const JOINCODE_REQUIRED = env.PUBLIC_JOINCODE === "yes";
export const LABELS = (env.PUBLIC_LABELS ?? "")
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);
export const BLOSSOM_URL = (env.PUBLIC_BLOSSOM_URL ?? "").replace(/\/$/, "");
