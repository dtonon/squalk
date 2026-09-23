// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
import type {
  ForumShell,
  OverviewSnapshot,
  Profiles,
  ThreadsSnapshot,
} from "$lib/forum/snapshot";
import type { ThreadDetail } from "$lib/forum/thread";

declare global {
  // Injected by vite.config.ts from PUBLIC_SSR, package.json and git
  const __SQUALK_SSR__: boolean;
  const __SQUALK_VERSION__: string;
  const __SQUALK_COMMIT__: string;

  namespace App {
    // interface Error {}
    // interface Locals {}
    // Server-rendered snapshots; null in the browser and in client-only builds
    interface PageData {
      shell?: ForumShell | null;
      profiles?: Profiles | null;
      thread?: ThreadDetail | null;
      threads?: ThreadsSnapshot | null;
      overview?: OverviewSnapshot | null;
    }
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
