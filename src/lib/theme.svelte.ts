import { browser } from "$app/environment";

export type Theme = "light" | "dark";

const KEY = "squalk:theme";

function osTheme(): Theme {
  if (!browser) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStored(): Theme | null {
  if (!browser) return null;
  const v = localStorage.getItem(KEY);
  return v === "light" || v === "dark" ? v : null;
}

function apply(theme: Theme) {
  if (!browser) return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}

const initialStored = readStored();
const initialTheme: Theme = initialStored ?? osTheme();

// The theme is "linked" to the OS preference when no explicit choice is stored.
// In that mode, OS changes propagate. Once the user picks a value that diverges
// from the OS, the link is broken and OS changes are ignored — only another
// user toggle can re-link (when the new pick happens to match the OS again).
export const themeState = $state({
  theme: initialTheme,
  linked: initialStored === null,
});

if (browser) {
  apply(initialTheme);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", (e) => {
    if (!themeState.linked) return;
    const next: Theme = e.matches ? "dark" : "light";
    themeState.theme = next;
    apply(next);
  });
}

export function toggleTheme() {
  const next: Theme = themeState.theme === "dark" ? "light" : "dark";
  const os = osTheme();
  if (next === os) {
    // Toggling to the current OS value re-links and clears the explicit pick.
    if (browser) localStorage.removeItem(KEY);
    themeState.linked = true;
  } else {
    if (browser) localStorage.setItem(KEY, next);
    themeState.linked = false;
  }
  themeState.theme = next;
  apply(next);
}
