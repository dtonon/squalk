import {
  PUBLIC_RELAY_URL,
  PUBLIC_GROUP_ID,
  PUBLIC_MODE,
} from "$env/static/public";

export const RELAY_URL = PUBLIC_RELAY_URL;
export const GROUP_ID = PUBLIC_GROUP_ID;
export const MODE: "simple" | "full" =
  PUBLIC_MODE === "full" ? "full" : "simple";
