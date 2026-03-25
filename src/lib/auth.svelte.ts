import type { NostrUser } from "@nostr/gadgets/metadata";
import type { WindowNostr } from "@nostr/tools/nip07";

declare global {
  interface Window {
    nostr?: WindowNostr;
  }
}

let user = $state<NostrUser | null>(null);
let signer = $state<WindowNostr | null>(null);

export const auth = {
  get user() {
    return user;
  },
  get signer() {
    return signer;
  },
};

const PUBKEY_KEY = "nostr_pubkey";

export async function login() {
  if (!window.nostr) {
    alert(
      "No Nostr extension found. Please install a Nostr extension like nos2x.",
    );
    return;
  }
  const pubkey = await window.nostr.getPublicKey();
  signer = window.nostr;
  localStorage.setItem(PUBKEY_KEY, pubkey);
  const { loadNostrUser } = await import("@nostr/gadgets/metadata");
  user = await loadNostrUser(pubkey);
}

export function logout() {
  user = null;
  signer = null;
  localStorage.removeItem(PUBKEY_KEY);
}

export async function restoreSession() {
  const pubkey = localStorage.getItem(PUBKEY_KEY);
  if (!pubkey) return;
  signer = window.nostr ?? null;
  const { loadNostrUser } = await import("@nostr/gadgets/metadata");
  user = await loadNostrUser(pubkey);
}
