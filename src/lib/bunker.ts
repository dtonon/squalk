import {
  BunkerSigner,
  createNostrConnectURI,
  parseBunkerInput,
  toBunkerURL,
} from "@nostr/tools/nip46";
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

const signerParams = {
  onauth: (url: string) => {
    window.open(url, "_blank");
  },
};

function stripSecret(url: string): string {
  const u = new URL(url);
  u.searchParams.delete("secret");
  return u.toString();
}

export async function connectBunker(input: string): Promise<BunkerSession> {
  const bp = await parseBunkerInput(input.trim());
  if (!bp) throw new Error("Invalid bunker");
  if (bp.relays.length === 0) throw new Error("Bunker URL has no relay");
  const sk = generateSecretKey();
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
    throw e;
  }
}

export type NostrConnect = {
  uri: string;
  // Resolves once a signer answers the URI; rejects on abort or relay close
  session: Promise<BunkerSession>;
  cancel: () => void;
};

export function startNostrConnect(): NostrConnect {
  const sk = generateSecretKey();
  const uri = createNostrConnectURI({
    clientPubkey: getPublicKey(sk),
    relays: NOSTRCONNECT_RELAYS,
    secret: Math.random().toString(36).substring(2, 10),
    name: location.host,
    url: location.origin,
  });
  const abort = new AbortController();
  const session = BunkerSigner.fromURI(
    sk,
    uri,
    signerParams,
    abort.signal,
  ).then(async (signer) => {
    const pubkey = await signer.getPublicKey();
    return {
      signer,
      pubkey,
      bunkerUrl: stripSecret(toBunkerURL(signer.bp)),
      clientSecretKey: bytesToHex(sk),
    };
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
  return BunkerSigner.fromBunker(hexToBytes(clientSecretKey), bp, signerParams);
}
