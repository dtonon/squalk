import { browser } from "$app/environment";

// Dynamic mode: the relay is chosen by the visitor at startup and kept in localStorage, so a reload boots straight into
// it. Changing relay clears the choice and reloads; nothing switches live, so
// every once-per-session cache stays valid.
const RELAY_KEY = "squalk_relay";
const RECENT_KEY = "squalk_recent_relays";
const RECENT_MAX = 5;

export type RecentRelay = { url: string; name: string };

// Accepts a bare host, adds the scheme (ws:// for localhost, wss:// otherwise)
// and returns the canonical URL or null when it isn't a websocket URL.
export function normalizeRelayUrl(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) {
    s = (/^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(s) ? "ws://" : "wss://") + s;
  }
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  if (url.protocol !== "wss:" && url.protocol !== "ws:") return null;
  if (!url.hostname) return null;
  url.hash = "";
  url.search = "";
  return url.href.replace(/\/$/, "");
}

function get(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function set(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked: the choice lasts for this page load only
  }
}

// The stored choice, or the one named by `?relay=` on the current URL, which
// wins (a shared link opens its relay) and becomes the stored choice.
export function readSetup(): { relay: string } {
  if (!browser) return { relay: "" };
  const fromUrl = normalizeRelayUrl(
    new URLSearchParams(location.search).get("relay") ?? "",
  );
  if (fromUrl && fromUrl !== get(RELAY_KEY)) set(RELAY_KEY, fromUrl);
  return { relay: get(RELAY_KEY) };
}

export function saveSetup(relay: string, name: string) {
  set(RELAY_KEY, relay);
  const recent = recentRelays().filter((r) => r.url !== relay);
  recent.unshift({ url: relay, name });
  set(RECENT_KEY, JSON.stringify(recent.slice(0, RECENT_MAX)));
}

export function removeRecent(url: string) {
  const recent = recentRelays().filter((r) => r.url !== url);
  set(RECENT_KEY, recent.length ? JSON.stringify(recent) : "");
}

export function recentRelays(): RecentRelay[] {
  try {
    const list: unknown = JSON.parse(get(RECENT_KEY) || "[]");
    if (!Array.isArray(list)) return [];
    return list.filter(
      (r): r is RecentRelay =>
        !!r && typeof r.url === "string" && typeof r.name === "string",
    );
  } catch {
    return [];
  }
}

// Forget the current relay and reboot on the setup screen. The recent list is
// kept so the visitor can come back with one click.
export function changeRelay() {
  set(RELAY_KEY, "");
  location.assign("/");
}
