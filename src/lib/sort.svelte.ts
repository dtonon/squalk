import { browser } from "$app/environment";
import type { SortMode } from "$lib/threads.svelte";

const KEY = "squalk:sort";

function read(): SortMode {
  if (!browser) return "active";
  return localStorage.getItem(KEY) === "new" ? "new" : "active";
}

let pref = $state<SortMode>(read());

// Global, remembered across home and rooms; survives reloads.
export const sortPref = {
  get value() {
    return pref;
  },
  set value(v: SortMode) {
    pref = v;
    if (browser) localStorage.setItem(KEY, v);
  },
};
