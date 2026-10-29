import { TITLE, FAVICON, DYNAMIC, RELAY_HOST } from "$lib/config";
import { relayAccess } from "$lib/access.svelte";

// Only http(s) is safe to put in an <img> or <link rel="icon">: the value
// comes from an untrusted relay's NIP-11 document.
function safeIcon(url: string | undefined): string {
  return url && /^https?:\/\//i.test(url) ? url : "";
}

// Instance branding. In dynamic mode the relay is the brand: its NIP-11 name
// (host until that lands) and icon come first. Otherwise PUBLIC_TITLE and
// PUBLIC_FAVICON; components add their own group-name fallbacks after these.
export const brand = {
  get title(): string {
    if (DYNAMIC) return relayAccess.info?.name || RELAY_HOST || TITLE;
    return TITLE;
  },
  get icon(): string {
    return DYNAMIC ? safeIcon(relayAccess.info?.icon) : "";
  },
  get favicon(): string {
    return (DYNAMIC && safeIcon(relayAccess.info?.icon)) || FAVICON;
  },
};
