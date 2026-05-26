import { SimplePool } from "@nostr/tools";
import { RELAY_URL } from "$lib/config";
import { auth } from "$lib/auth.svelte";

// What's pending deletion, surfaced to the confirmation modal. `label` is the
// noun shown in the dialog copy ("discussion", "reply", "message").
type DeleteTarget = {
  eventId: string;
  groupId: string;
  label: string;
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

// NIP-29 kind:9005 delete-event. The relay enforces the role check and only
// resolves the publish (OK: true) once it has processed the deletion.
export async function confirmDelete(reason?: string) {
  if (!target) return;
  if (!auth.signer) {
    error = "Not logged in";
    return;
  }
  busy = true;
  error = null;

  const tags: string[][] = [
    ["h", target.groupId],
    ["e", target.eventId],
  ];

  try {
    const signed = await auth.signer.signEvent({
      kind: 9005,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: reason?.trim() ?? "",
    });

    const pool = new SimplePool();
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Relay did not respond in time")),
          8000,
        ),
      );
      await Promise.race([
        Promise.all(pool.publish([RELAY_URL], signed)),
        timeout,
      ]);
    } finally {
      pool.destroy();
    }

    onDeleted?.();
    target = null;
    onDeleted = null;
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to delete";
  } finally {
    busy = false;
  }
}
