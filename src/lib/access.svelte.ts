import type { AbstractRelay } from "@nostr/tools/abstract-relay";
import { auth } from "$lib/auth.svelte";
import { ensureForumRelay, forumRelayInfo } from "$lib/relay";
import type { ForumRelayInfo } from "$lib/relay";

// Whether the forum relay will serve this visitor at all. A relay can refuse
// every read (auth-required for anonymous visitors, restricted for logged-in
// non-members, blocked for bans), in which case the app would otherwise just
// look empty; the layout shows a gate page instead until a probe comes back
// open.
export type RelayAccess =
  | "checking"
  | "open"
  | "auth-required"
  | "restricted"
  | "blocked";

let state = $state<RelayAccess>("checking");
let message = $state<string | null>(null);
let info = $state<ForumRelayInfo | null>(null);
// Bumped when a probe completes, so listeners can react to every result even
// when the state itself didn't change (open → open after a login).
let probes = $state(0);

export const relayAccess = {
  get state() {
    return state;
  },
  get message() {
    return message;
  },
  get info() {
    return info;
  },
  get probes() {
    return probes;
  },
};

// Sends a throwaway REQ and reads the CLOSED reason: nostr-tools' query helpers
// discard it, and it is the only cross-relay signal for a read gate. No `#h`
// in the filter, so a private group's per-group auth-required (handled by the
// room itself) can't masquerade as a relay-wide one.
function probeRead(relay: AbstractRelay): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (reason: string | null) => {
      if (settled) return;
      settled = true;
      try {
        sub.close();
      } catch {}
      resolve(reason);
    };
    const sub = relay.subscribe([{ kinds: [39000], limit: 1 }], {
      onevent() {},
      oneose() {
        finish(null);
      },
      onclose(reason) {
        finish(reason);
      },
    });
    setTimeout(() => finish(null), 4000);
  });
}

function classify(reason: string | null): RelayAccess {
  const r = (reason ?? "").toLowerCase();
  if (r.startsWith("auth-required:")) return "auth-required";
  if (r.startsWith("restricted:")) return "restricted";
  if (r.startsWith("blocked:")) return "blocked";
  return "open";
}

let inFlight: Promise<RelayAccess> | null = null;

// Re-evaluates access for the current signer. Concurrent calls share one probe.
// An anonymous visitor on a relay whose NIP-11 declares auth_required is gated
// without waiting for the relay to refuse a request.
export function probeRelayAccess(): Promise<RelayAccess> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const relayInfo = await forumRelayInfo();
      info = relayInfo;
      let next: RelayAccess;
      let reason: string | null = null;
      if (!auth.signer && relayInfo.authRequired) {
        next = "auth-required";
      } else {
        try {
          reason = await probeRead(await ensureForumRelay());
        } catch {
          reason = null; // connection failure: the pages surface their own errors
        }
        next = classify(reason);
      }
      state = next;
      message =
        next === "open" ? null : (reason?.replace(/^[a-z-]+:\s*/i, "") ?? null);
      probes++;
      return next;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
