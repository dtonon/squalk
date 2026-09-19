import {
  BunkerSigner,
  createNostrConnectURI,
  parseBunkerInput,
  toBunkerURL,
  type BunkerPointer,
} from "@nostr/tools/nip46";
import { SimplePool } from "@nostr/tools/pool";
import { NostrConnect as NostrConnectKind } from "@nostr/tools/kinds";
import { decrypt, getConversationKey } from "@nostr/tools/nip44";
import { generateSecretKey, getPublicKey } from "@nostr/tools/pure";
import { bytesToHex, hexToBytes } from "@nostr/tools/utils";
import { NOSTRCONNECT_RELAYS } from "$lib/config";

// NIP-46 remote signing. Two ways in: the user pastes a bunker:// URL (or a
// NIP-05 that advertises one), or the app shows a nostrconnect:// URI and the
// signer app calls back. Either way the result is a live BunkerSigner plus the
// data needed to reconnect silently next time: the bunker URL (secret
// stripped) and the client key the conversation is bound to.

export type BunkerSession = {
  signer: BunkerSigner;
  pubkey: string;
  bunkerUrl: string;
  clientSecretKey: string;
};

// The signer app usually lives on the phone, and on mobile the browser tab is
// backgrounded while the user approves there, which can drop the socket. A
// reconnecting pool keeps the subscriptions alive across that.
const pool = new SimplePool({ enableReconnect: true });

// The approval happens in the signer app, so the tab is backgrounded and its
// sockets can drop; nostr-tools only retries after a 10s backoff. Reconnect
// the relays this flow has used as soon as the tab or the network is back,
// and keep a shorter backoff for drops in between.
const FAST_BACKOFF = [1000, 2000, 5000, 10000];
const usedRelays = new Set<string>();
function touchRelays(urls: string[] = []) {
  for (const url of urls) usedRelays.add(url);
  for (const url of usedRelays) {
    pool
      .ensureRelay(url)
      .then((relay) => {
        relay.resubscribeBackoff = FAST_BACKOFF;
      })
      .catch(() => {});
  }
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) touchRelays();
  });
  window.addEventListener("online", () => touchRelays());
}

const signerParams = {
  pool,
  onauth: (url: string) => {
    window.open(url, "_blank");
  },
};

function stripSecret(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("secret");
  return u.toString();
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function connectBunker(input: string): Promise<BunkerSession> {
  const bp = await parseBunkerInput(input.trim());
  if (!bp) throw new Error("Invalid bunker");
  if (bp.relays.length === 0) throw new Error("Bunker URL has no relay");
  const sk = generateSecretKey();
  touchRelays(bp.relays);
  const signer = BunkerSigner.fromBunker(sk, bp, signerParams);
  try {
    await signer.connect();
    const pubkey = await signer.getPublicKey();
    return {
      signer,
      pubkey,
      bunkerUrl: stripSecret(toBunkerURL(bp)),
      clientSecretKey: bytesToHex(sk),
    };
  } catch (e) {
    signer.close().catch(() => {});
    throw new Error(`Bunker error: ${describe(e)}`);
  }
}

export type NostrConnect = {
  uri: string;
  // Resolves once a signer answers the URI; rejects on abort or relay close
  session: Promise<BunkerSession>;
  cancel: () => void;
};

// Waits for the signer's reply to a nostrconnect:// URI. Unlike the library's
// helper, the filter has no `limit: 0`, so a reply published while the tab was
// offline is replayed once the relay reconnects.
function waitForConnect(
  sk: Uint8Array,
  secret: string,
  signal: AbortSignal,
): Promise<BunkerPointer> {
  const clientPubkey = getPublicKey(sk);
  touchRelays(NOSTRCONNECT_RELAYS);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      sub.close();
      fn();
    };
    const sub = pool.subscribe(
      NOSTRCONNECT_RELAYS,
      {
        kinds: [NostrConnectKind],
        "#p": [clientPubkey],
        since: Math.floor(Date.now() / 1000) - 60,
      },
      {
        onevent: (event) => {
          let reply: { result?: string; error?: string };
          try {
            const key = getConversationKey(sk, event.pubkey);
            reply = JSON.parse(decrypt(event.content, key));
          } catch (e) {
            console.warn("nostrconnect: undecryptable reply", e);
            return;
          }
          if (reply.result === secret) {
            finish(() =>
              resolve({
                pubkey: event.pubkey,
                relays: NOSTRCONNECT_RELAYS,
                secret,
              }),
            );
          } else if (reply.error) {
            finish(() => reject(new Error(`Signer refused: ${reply.error}`)));
          } else {
            finish(() =>
              reject(
                new Error(
                  `Signer replied "${reply.result}" instead of the secret`,
                ),
              ),
            );
          }
        },
        onclose: (reasons) =>
          finish(() =>
            reject(new Error(`Relay closed: ${reasons.join("; ")}`)),
          ),
      },
    );
    // Closes the subscription on every relay; the pool's own abort handling
    // only reaches the last one
    signal.addEventListener("abort", () =>
      finish(() => reject(new Error("Cancelled"))),
    );
  });
}

// `onAck` fires the moment the signer answers the URI, before the follow-up
// round-trip that completes the session — the point where "waiting for the
// signer" becomes "finishing up".
export function startNostrConnect(onAck?: () => void): NostrConnect {
  const sk = generateSecretKey();
  const secret = Math.random().toString(36).substring(2, 10);
  const uri = createNostrConnectURI({
    clientPubkey: getPublicKey(sk),
    relays: NOSTRCONNECT_RELAYS,
    secret,
    name: location.host,
    url: location.origin,
  });
  const abort = new AbortController();
  const session = waitForConnect(sk, secret, abort.signal).then(async (bp) => {
    onAck?.();
    // The signer already accepted this client key; no connect round-trip
    const signer = BunkerSigner.fromBunker(sk, bp, signerParams);
    try {
      const pubkey = await signer.getPublicKey();
      return {
        signer,
        pubkey,
        bunkerUrl: stripSecret(toBunkerURL(bp)),
        clientSecretKey: bytesToHex(sk),
      };
    } catch (e) {
      signer.close().catch(() => {});
      throw new Error(`Bunker error: ${describe(e)}`);
    }
  });
  return { uri, session, cancel: () => abort.abort() };
}

// Rebuilds the signer from stored data without a connect round-trip: the
// bunker already knows this client key, so the first sign request is enough.
export async function restoreBunker(
  bunkerUrl: string,
  clientSecretKey: string,
): Promise<BunkerSigner> {
  const bp = await parseBunkerInput(bunkerUrl);
  if (!bp) throw new Error("Invalid bunker");
  touchRelays(bp.relays);
  return BunkerSigner.fromBunker(hexToBytes(clientSecretKey), bp, signerParams);
}
