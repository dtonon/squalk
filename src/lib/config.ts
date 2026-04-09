import {
  PUBLIC_RELAY_URL,
  PUBLIC_GROUP_ID,
  PUBLIC_MODE,
  PUBLIC_JOINCODE,
  PUBLIC_LABELS,
  PUBLIC_BLOSSOM_URL,
} from "$env/static/public";

export const RELAY_URL = PUBLIC_RELAY_URL;
export const GROUP_ID = PUBLIC_GROUP_ID;
export const MODE: "simple" | "full" =
  PUBLIC_MODE === "full" ? "full" : "simple";
export const JOINCODE_REQUIRED = PUBLIC_JOINCODE === "yes";
export const LABELS = (PUBLIC_LABELS ?? "")
  .split(",")
  .map((l) => l.trim())
  .filter(Boolean);
export const BLOSSOM_URL = (PUBLIC_BLOSSOM_URL ?? "").replace(/\/$/, "");
