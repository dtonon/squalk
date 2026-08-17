import type { Event } from "@nostr/tools/core";
import * as nip19 from "@nostr/tools/nip19";
import type { NostrUser } from "$lib/gadgets";
import type { Query } from "./query";

// Public relays with broad kind-0 coverage.
export const PROFILE_RELAYS = [
  "wss://purplepag.es",
  "wss://relay.nostr.band",
  "wss://relay.damus.io",
  "wss://nos.lol",
];

// Same shape @nostr/gadgets produces, built here from raw kind-0 events so the
// server can resolve authors without that (browser-only) library.
export function bareUser(pubkey: string): NostrUser {
  const npub = nip19.npubEncode(pubkey);
  return {
    pubkey,
    npub,
    shortName: npub.substring(0, 8) + "…" + npub.substring(59),
    metadata: {},
    lastUpdated: 0,
  };
}

export function userFromEvent(e: Event): NostrUser {
  const u = bareUser(e.pubkey);
  let md: NostrUser["metadata"] = {};
  try {
    md = JSON.parse(e.content) ?? {};
  } catch {
    // Malformed metadata: keep the bare user
  }
  u.metadata = md;
  u.shortName =
    md.name || md.display_name || md.nip05?.split("@")?.[0] || u.shortName;
  u.lastUpdated = e.created_at;
  if (md.picture) u.image = md.picture;
  return u;
}

// Newest kind 0 per pubkey; pubkeys with no metadata are left out.
export async function fetchProfiles(
  q: Query,
  pubkeys: string[],
): Promise<Record<string, NostrUser>> {
  const out: Record<string, NostrUser> = {};
  if (pubkeys.length === 0) return out;
  const events = await q({ kinds: [0], authors: pubkeys });
  for (const e of events) {
    const prev = out[e.pubkey];
    if (prev && prev.lastUpdated >= e.created_at) continue;
    out[e.pubkey] = userFromEvent(e);
  }
  return out;
}
