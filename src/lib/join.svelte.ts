import { Relay, SimplePool } from "@nostr/tools";
import { auth } from "$lib/auth.svelte";
import { GROUP_ID, RELAY_URL, JOINCODE_REQUIRED } from "$lib/config";

let joined = $state(false);
let modalOpen = $state(false);
let modalError = $state<string | null>(null);
let busy = $state(false);
let pendingAction: (() => Promise<void>) | null = null;

export const joinState = {
  get joined() {
    return joined;
  },
  get modalOpen() {
    return modalOpen;
  },
  get modalError() {
    return modalError;
  },
  get busy() {
    return busy;
  },
  get codeRequired() {
    return JOINCODE_REQUIRED;
  },
};

export function resetJoinState() {
  joined = false;
  modalOpen = false;
  modalError = null;
  busy = false;
  pendingAction = null;
}

// Checks group membership: kind:9000 (per-user put-user event, lightweight)
// first, falling back to kind:39002 (full members list, heavier) only if 9000
// did not match. Either signal marks the user as joined and skips the 9021.
function queryHasMatch(
  relay: Relay,
  filter: Parameters<Relay["subscribe"]>[0][number],
  timeoutMs = 3000,
): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (val: boolean) => {
      if (settled) return;
      settled = true;
      try {
        sub.close();
      } catch {}
      resolve(val);
    };
    const sub = relay.subscribe([filter], {
      onevent() {
        finish(true);
      },
      oneose() {
        finish(false);
      },
      onclose() {
        finish(false);
      },
    });
    setTimeout(() => finish(false), timeoutMs);
  });
}

export async function initJoinForUser(pubkey: string) {
  let relay: Relay;
  try {
    relay = await Relay.connect(RELAY_URL);
  } catch {
    return;
  }
  try {
    const has9000 = await queryHasMatch(relay, {
      kinds: [9000],
      "#h": [GROUP_ID],
      "#p": [pubkey],
      limit: 1,
    });
    if (has9000) {
      joined = true;
      return;
    }
    const has39002 = await queryHasMatch(relay, {
      kinds: [39002],
      "#d": [GROUP_ID],
      "#p": [pubkey],
      limit: 1,
    });
    if (has39002) joined = true;
  } finally {
    try {
      relay.close();
    } catch {}
  }
}

export function closeJoinModal() {
  if (busy) return;
  modalOpen = false;
  modalError = null;
  pendingAction = null;
}

async function publishJoinRequest(code?: string) {
  if (!auth.signer) throw new Error("Not logged in");
  const tags: string[][] = [["h", GROUP_ID]];
  if (code) tags.push(["code", code]);
  const event = await auth.signer.signEvent({
    kind: 9021,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: "",
  });
  const pool = new SimplePool();
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Relay did not respond in time")), 8000),
    );
    await Promise.race([
      Promise.all(pool.publish([RELAY_URL], event)),
      timeout,
    ]);
  } finally {
    pool.destroy();
  }
}

// Wraps a group action. If not yet joined, sends kind:9021 first, then the
// action. On failure, opens the join modal so the user can retry (with code if
// configured). Returns true on success, false if the modal was opened.
export async function withJoin(action: () => Promise<void>): Promise<boolean> {
  if (joined) {
    await action();
    return true;
  }
  busy = true;
  try {
    await publishJoinRequest();
    await action();
    joined = true;
    return true;
  } catch (e) {
    pendingAction = action;
    modalError = e instanceof Error ? e.message : "Could not join the group";
    modalOpen = true;
    return false;
  } finally {
    busy = false;
  }
}

export async function retryJoin(code?: string) {
  if (!pendingAction || busy) return;
  busy = true;
  modalError = null;
  try {
    await publishJoinRequest(code);
    await pendingAction();
    joined = true;
    modalOpen = false;
    pendingAction = null;
  } catch (e) {
    modalError = e instanceof Error ? e.message : "Could not join the group";
  } finally {
    busy = false;
  }
}
