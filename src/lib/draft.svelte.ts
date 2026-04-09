import { SimplePool } from "@nostr/tools";
import { auth } from "$lib/auth.svelte";
import { withJoin } from "$lib/join.svelte";
import { GROUP_ID, RELAY_URL } from "$lib/config";

let modalOpen = $state(false);
let iconized = $state(false);
let title = $state("");
let labels = $state<string[]>([]);
let content = $state("");
let publishing = $state(false);
let publishError = $state<string | null>(null);

export const draftState = {
  get modalOpen() { return modalOpen; },
  get iconized() { return iconized; },
  get title() { return title; },
  set title(v: string) { title = v; },
  get labels() { return labels; },
  get content() { return content; },
  set content(v: string) { content = v; },
  get publishing() { return publishing; },
  get publishError() { return publishError; },
  get hasDraft() {
    return title.trim().length > 0 ||
      content.trim().length > 0 ||
      labels.length > 0;
  },
};

export function openDraft() {
  modalOpen = true;
  iconized = false;
  publishError = null;
}

export function iconizeDraft() {
  modalOpen = false;
  iconized = true;
}

export function resumeDraft() {
  modalOpen = true;
  iconized = false;
}

export function discardDraft() {
  title = "";
  labels = [];
  content = "";
  publishError = null;
  modalOpen = false;
  iconized = false;
}

export function addLabel(l: string) {
  const v = l.trim();
  if (!v) return;
  if (labels.includes(v)) return;
  labels = [...labels, v];
}

export function removeLabel(l: string) {
  labels = labels.filter((x) => x !== l);
}

export async function publishDraft(): Promise<{ ok: boolean; threadId?: string }> {
  if (!auth.signer) {
    publishError = "Not logged in";
    return { ok: false };
  }
  const t = title.trim();
  const c = content.trim();
  if (!t || !c) {
    publishError = "Title and content are required";
    return { ok: false };
  }

  publishing = true;
  publishError = null;
  let threadId: string | undefined;

  try {
    const success = await withJoin(async () => {
      const tags: string[][] = [
        ["h", GROUP_ID],
        ["title", t],
      ];
      for (const l of labels) tags.push(["t", l]);

      const event = await auth.signer!.signEvent({
        kind: 11,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: c,
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

      threadId = event.id;
    });

    if (success && threadId) {
      discardDraft();
      return { ok: true, threadId };
    }
    return { ok: false };
  } catch (e) {
    publishError = e instanceof Error ? e.message : "Failed to publish";
    return { ok: false };
  } finally {
    publishing = false;
  }
}
