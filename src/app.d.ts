// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type { ForumShell, Profiles } from "$lib/forum/snapshot";
import type { ThreadDetail } from "$lib/forum/thread";

declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // Server-rendered snapshots; null in the browser and in client-only builds
    interface PageData {
      shell?: ForumShell | null;
      profiles?: Profiles | null;
      thread?: ThreadDetail | null;
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
