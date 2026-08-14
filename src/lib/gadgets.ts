import type { NostrUser } from "@nostr/gadgets/metadata";
import type { ListFetcher, RelayItem } from "@nostr/gadgets/lists";

export type { NostrUser, RelayItem };

// @nostr/gadgets reads localStorage when imported, so it can't be loaded on
// the server. Every consumer goes through these lazy wrappers; the library is
// pulled in on first use, in the browser only.
export async function loadNostrUser(pubkey: string): Promise<NostrUser> {
  const m = await import("@nostr/gadgets/metadata");
  return m.loadNostrUser(pubkey);
}

export const loadRelayList: ListFetcher<RelayItem> = async (...args) => {
  const m = await import("@nostr/gadgets/lists");
  return m.loadRelayList(...args);
};
