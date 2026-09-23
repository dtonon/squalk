import type { NostrUser } from "@nostr/gadgets/metadata";
import type { WindowNostr } from "@nostr/tools/nip07";
import type { EventTemplate, VerifiedEvent } from "@nostr/tools/core";
import * as nip19 from "@nostr/tools/nip19";
import { finalizeEvent, getPublicKey } from "@nostr/tools/pure";
import { resetJoinState, initJoinForUser } from "$lib/join.svelte";
import {
  connectBunker,
  restoreBunker,
  startNostrConnect,
  type BunkerSession,
  type NostrConnect,
} from "$lib/bunker";
import type { BunkerSigner } from "@nostr/tools/nip46";

declare global {
  interface Window {
    nostr?: WindowNostr;
  }
}

export type Signer = {
  getPublicKey(): Promise<string>;
  signEvent(template: EventTemplate): Promise<VerifiedEvent>;
};

let user = $state<NostrUser | null>(null);
let signer = $state<Signer | null>(null);
// Kept outside $state (see makeExtensionSigner) so it can be closed on logout
let bunker: BunkerSigner | null = null;
let loginModalOpen = $state(false);
// Optional action to run once login succeeds, so an intent like "post" started
// while logged out resumes (login => join => composer) instead of being dropped.
let afterLogin: (() => void) | null = null;
// Bumped on explicit login/logout (not on silent session restore) so the app
// can re-fetch identity-scoped data — e.g. reload the room list once the relay
// will serve the user's private/hidden groups.
let sessionEpoch = $state(0);

export const auth = {
  get user() {
    return user;
  },
  get signer() {
    return signer;
  },
  get loginModalOpen() {
    return loginModalOpen;
  },
  get sessionEpoch() {
    return sessionEpoch;
  },
};

const PUBKEY_KEY = "nostr_pubkey";
const METHOD_KEY = "nostr_login_method";
const NSEC_KEY = "nostr_nsec";
const BUNKER_KEY = "nostr_bunker";
const BUNKER_CLIENT_KEY = "nostr_bunker_client_key";

export function openLogin(after?: () => void) {
  afterLogin = after ?? null;
  loginModalOpen = true;
}

export function closeLogin() {
  loginModalOpen = false;
  afterLogin = null;
}

// Closes the modal and runs the pending intent (if any). Called from the login
// flows so the continuation fires with the modal already gone (no stacking).
function runAfterLogin() {
  const cb = afterLogin;
  afterLogin = null;
  loginModalOpen = false;
  cb?.();
}

function makeNsecSigner(secretKey: Uint8Array): Signer {
  const pubkey = getPublicKey(secretKey);
  return {
    async getPublicKey() {
      return pubkey;
    },
    async signEvent(template) {
      return finalizeEvent(template, secretKey);
    },
  };
}

// Always reads window.nostr at call time. This avoids two issues:
// 1. window.nostr may not be injected yet when restoreSession runs.
// 2. Storing window.nostr in a $state wraps it in a reactive proxy, which
//    rebinds `this` and confuses some extensions (request never resolves).
function makeExtensionSigner(): Signer {
  return {
    async getPublicKey() {
      if (!window.nostr) throw new Error("No Nostr extension found");
      return window.nostr.getPublicKey();
    },
    async signEvent(template) {
      if (!window.nostr) throw new Error("No Nostr extension found");
      return window.nostr.signEvent(template);
    },
  };
}

function makeBunkerSigner(remote: BunkerSigner, pubkey: string): Signer {
  return {
    async getPublicKey() {
      return pubkey;
    },
    async signEvent(template) {
      return remote.signEvent(template);
    },
  };
}

function closeBunker() {
  bunker?.close().catch(() => {});
  bunker = null;
}

export function loginMethod(): string | null {
  return user ? localStorage.getItem(METHOD_KEY) : null;
}

function clearStoredSession() {
  localStorage.removeItem(PUBKEY_KEY);
  localStorage.removeItem(METHOD_KEY);
  localStorage.removeItem(NSEC_KEY);
  localStorage.removeItem(BUNKER_KEY);
  localStorage.removeItem(BUNKER_CLIENT_KEY);
}

async function setUser(pubkey: string) {
  const { loadNostrUser } = await import("@nostr/gadgets/metadata");
  user = await loadNostrUser(pubkey);
  initJoinForUser(pubkey);
}

export async function loginWithExtension() {
  if (!window.nostr) {
    throw new Error("No Nostr extension found");
  }
  const pubkey = await window.nostr.getPublicKey();
  closeBunker();
  signer = makeExtensionSigner();
  clearStoredSession();
  localStorage.setItem(PUBKEY_KEY, pubkey);
  localStorage.setItem(METHOD_KEY, "extension");
  await setUser(pubkey);
  sessionEpoch++;
  runAfterLogin();
}

function parseSecretKey(input: string): Uint8Array {
  const trimmed = input.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const sk = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      sk[i] = parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    }
    return sk;
  }
  let decoded;
  try {
    decoded = nip19.decode(trimmed);
  } catch {
    throw new Error("Invalid nsec");
  }
  if (decoded.type !== "nsec") throw new Error("Invalid nsec");
  return decoded.data;
}

export async function loginWithNsec(input: string) {
  const sk = parseSecretKey(input);
  const nsec = nip19.nsecEncode(sk);
  const pubkey = getPublicKey(sk);
  closeBunker();
  signer = makeNsecSigner(sk);
  clearStoredSession();
  localStorage.setItem(PUBKEY_KEY, pubkey);
  localStorage.setItem(METHOD_KEY, "nsec");
  localStorage.setItem(NSEC_KEY, nsec);
  await setUser(pubkey);
  sessionEpoch++;
  runAfterLogin();
}

async function loginWithBunkerSession(session: BunkerSession) {
  closeBunker();
  bunker = session.signer;
  signer = makeBunkerSigner(session.signer, session.pubkey);
  clearStoredSession();
  localStorage.setItem(PUBKEY_KEY, session.pubkey);
  localStorage.setItem(METHOD_KEY, "bunker");
  localStorage.setItem(BUNKER_KEY, session.bunkerUrl);
  localStorage.setItem(BUNKER_CLIENT_KEY, session.clientSecretKey);
  await setUser(session.pubkey);
  sessionEpoch++;
  runAfterLogin();
}

// Pasted bunker:// URL or a NIP-05 that advertises one
export async function loginWithBunker(input: string) {
  await loginWithBunkerSession(await connectBunker(input));
}

// Client-initiated flow: show `uri` (QR/link) and await `done`. `cancel` stops
// waiting when the user leaves the view.
// `onAck` reports the signer's first reply so the UI can show progress while
// the session is finalized.
export function loginWithNostrConnect(onAck?: () => void): {
  uri: string;
  done: Promise<void>;
  cancel: () => void;
} {
  const nc: NostrConnect = startNostrConnect(onAck);
  return {
    uri: nc.uri,
    done: nc.session.then(loginWithBunkerSession),
    cancel: nc.cancel,
  };
}

export function logout() {
  user = null;
  signer = null;
  closeBunker();
  clearStoredSession();
  resetJoinState();
  sessionEpoch++;
}

export async function restoreSession() {
  const pubkey = localStorage.getItem(PUBKEY_KEY);
  if (!pubkey) return;
  const method = localStorage.getItem(METHOD_KEY) ?? "extension";

  if (method === "nsec") {
    const nsec = localStorage.getItem(NSEC_KEY);
    if (!nsec) return;
    try {
      const decoded = nip19.decode(nsec);
      if (decoded.type !== "nsec") return;
      signer = makeNsecSigner(decoded.data);
    } catch {
      return;
    }
  } else if (method === "bunker") {
    const url = localStorage.getItem(BUNKER_KEY);
    const clientKey = localStorage.getItem(BUNKER_CLIENT_KEY);
    if (!url || !clientKey) return;
    try {
      bunker = await restoreBunker(url, clientKey);
    } catch {
      return;
    }
    signer = makeBunkerSigner(bunker, pubkey);
  } else {
    signer = makeExtensionSigner();
  }
  await setUser(pubkey);
}
