import { auth } from "$lib/auth.svelte";
import { publishForum } from "$lib/relay";

// Users may delete their own posts only within this window; afterwards the relay
// also refuses (pyramid caps group self-deletes at 2h, we're stricter on top).
export const SELF_DELETE_WINDOW = 30 * 60; // seconds

export function withinSelfDeleteWindow(createdAt: number): boolean {
  return Math.floor(Date.now() / 1000) - createdAt <= SELF_DELETE_WINDOW;
}

// What's pending deletion, surfaced to the confirmation modal. `label` is the
// noun shown in the dialog copy ("discussion", "reply", "message"). `self` picks
// the mechanism: authors delete via NIP-09 (kind 5), admins moderate via
// NIP-29 (kind 9005). `eventKind` feeds the NIP-09 `k` tag.
type DeleteTarget = {
  eventId: string;
  groupId: string;
  label: string;
  self?: boolean;
  eventKind?: number;
};

let target = $state<DeleteTarget | null>(null);
let busy = $state(false);
let error = $state<string | null>(null);

// Kept out of reactive state on purpose: a closure stored in $state would be
// proxied, and the caller decides how to visually hide the event on success.
let onDeleted: (() => void) | null = null;

export const deleteState = {
  get target() {
    return target;
  },
  get open() {
    return target !== null;
  },
  get busy() {
    return busy;
  },
  get error() {
    return error;
  },
};

export function requestDelete(t: DeleteTarget, handler: () => void) {
  target = t;
  onDeleted = handler;
  error = null;
}

export function cancelDelete() {
  if (busy) return;
  target = null;
  onDeleted = null;
  error = null;
}

// Authors self-delete with NIP-09 (kind 5); admins moderate with NIP-29
// (kind 9005). The relay enforces the matching rule (author match / role) and
// only resolves the publish (OK: true) once it has processed the deletion.
export async function confirmDelete(reason?: string) {
  if (!target) return;
  if (!auth.signer) {
    error = "Not logged in";
    return;
  }
  busy = true;
  error = null;

  const kind = target.self ? 5 : 9005;
  const tags: string[][] = [
    ["h", target.groupId],
    ["e", target.eventId],
  ];
  if (target.self && target.eventKind !== undefined) {
    tags.push(["k", String(target.eventKind)]);
  }

  try {
    const signed = await auth.signer.signEvent({
      kind,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: reason?.trim() ?? "",
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Relay did not respond in time")),
        8000,
      ),
    );
    await Promise.race([Promise.all(publishForum(signed)), timeout]);

    onDeleted?.();
    target = null;
    onDeleted = null;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to delete";
  } finally {
    busy = false;
  }
}
