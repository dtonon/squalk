import type { NostrUser } from "@nostr/gadgets/metadata";
import type { WindowNostr } from "@nostr/tools/nip07";
import type { EventTemplate, VerifiedEvent } from "@nostr/tools/core";
import * as nip19 from "@nostr/tools/nip19";
import { finalizeEvent, getPublicKey } from "@nostr/tools/pure";
import { resetJoinState, initJoinForUser } from "$lib/join.svelte";

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
let loginModalOpen = $state(false);

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
};

const PUBKEY_KEY = "nostr_pubkey";
const METHOD_KEY = "nostr_login_method";
const NSEC_KEY = "nostr_nsec";

export function openLogin() {
  loginModalOpen = true;
}

export function closeLogin() {
  loginModalOpen = false;
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
  signer = makeExtensionSigner();
  localStorage.setItem(PUBKEY_KEY, pubkey);
  localStorage.setItem(METHOD_KEY, "extension");
  localStorage.removeItem(NSEC_KEY);
  await setUser(pubkey);
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
  signer = makeNsecSigner(sk);
  localStorage.setItem(PUBKEY_KEY, pubkey);
  localStorage.setItem(METHOD_KEY, "nsec");
  localStorage.setItem(NSEC_KEY, nsec);
  await setUser(pubkey);
}

export function logout() {
  user = null;
  signer = null;
  localStorage.removeItem(PUBKEY_KEY);
  localStorage.removeItem(METHOD_KEY);
  localStorage.removeItem(NSEC_KEY);
  resetJoinState();
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
  } else {
    signer = makeExtensionSigner();
  }
  await setUser(pubkey);
}
