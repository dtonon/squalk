import * as nip19 from "@nostr/tools/nip19";
import { loadRelayList } from "@nostr/gadgets/lists";

const RELAY_HINT_TIMEOUT_MS = 1500;

export function extractMentionPubkeys(content: string): string[] {
  const re = /nostr:(npub1[a-z0-9]+|nprofile1[a-z0-9]+)/gi;
  const out = new Set<string>();
  for (const m of content.matchAll(re)) {
    try {
      const decoded = nip19.decode(m[1]);
      if (decoded.type === "npub") out.add(decoded.data);
      else if (decoded.type === "nprofile") out.add(decoded.data.pubkey);
    } catch {
      // Invalid bech32, skip
    }
  }
  return [...out];
}

export type QuotedEvent = {
  id: string;
  relay?: string;
  author?: string;
};

export function extractQuotedEvents(content: string): QuotedEvent[] {
  const re = /nostr:(note1[a-z0-9]+|nevent1[a-z0-9]+)/gi;
  const seen = new Map<string, QuotedEvent>();
  for (const m of content.matchAll(re)) {
    try {
      const decoded = nip19.decode(m[1]);
      if (decoded.type === "note") {
        if (!seen.has(decoded.data)) seen.set(decoded.data, { id: decoded.data });
      } else if (decoded.type === "nevent") {
        const { id, relays, author } = decoded.data;
        if (!seen.has(id))
          seen.set(id, { id, relay: relays?.[0], author });
      }
    } catch {
      // Invalid bech32, skip
    }
  }
  return [...seen.values()];
}

export async function relayHintFor(pubkey: string): Promise<string | undefined> {
  try {
    const TIMEOUT = Symbol();
    const result = await Promise.race([
      loadRelayList(pubkey),
      new Promise<typeof TIMEOUT>((resolve) =>
        setTimeout(() => resolve(TIMEOUT), RELAY_HINT_TIMEOUT_MS),
      ),
    ]);
    if (result === TIMEOUT) return undefined;
    return result.items.find((r) => r.write)?.url;
  } catch {
    return undefined;
  }
}

export async function buildPTagHints(pubkeys: Iterable<string>): Promise<Map<string, string>> {
  const hints = new Map<string, string>();
  await Promise.all(
    [...pubkeys].map(async (pk) => {
      const url = await relayHintFor(pk);
      if (url) hints.set(pk, url);
    }),
  );
  return hints;
}
