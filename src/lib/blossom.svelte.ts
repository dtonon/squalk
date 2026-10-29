import { BLOSSOM_URL, RELAY_URL } from "$lib/config";

// The Blossom server uploads go to. An explicit one (env) is final; otherwise the relay host when it also serves
// Blossom, else none and uploads stay disabled.
let url = $state(BLOSSOM_URL);

export const blossom = {
  get url() {
    return url;
  },
};

// Blossom servers must answer with open CORS and BUD-06 defines HEAD /upload,
// so a plain relay host (404, or no CORS at all) fails the probe.
async function probeRelayHost(): Promise<string> {
  const base = RELAY_URL.replace(/^ws/, "http");
  try {
    const res = await fetch(`${base}/upload`, {
      method: "HEAD",
      signal: AbortSignal.timeout(5000),
    });
    return res.status !== 404 && res.status !== 405 ? base : "";
  } catch {
    return "";
  }
}

let resolved = false;

export async function resolveBlossom(): Promise<void> {
  if (BLOSSOM_URL || resolved) return;
  resolved = true;
  url = (await probeRelayHost()).replace(/\/$/, "");
}
