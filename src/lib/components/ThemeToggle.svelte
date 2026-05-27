<script lang="ts">
  import { themeState, toggleTheme } from "$lib/theme.svelte";

  type Props = { size?: "sm" | "md" };
  let { size = "sm" }: Props = $props();

  const isDark = $derived(themeState.theme === "dark");
  const iconSize = $derived(size === "md" ? "h-6 w-6" : "h-5 w-5");
  const padding = $derived(size === "md" ? "p-3" : "p-2.5");
  const label = $derived(
    isDark ? "Switch to light theme" : "Switch to dark theme",
  );
  // The tooltip clarifies whether the current state follows the OS or is pinned,
  // so users can tell at a glance if their pick will outlive an OS theme change.
  const title = $derived(
    themeState.linked
      ? `Following system (${themeState.theme})`
      : `${themeState.theme.charAt(0).toUpperCase()}${themeState.theme.slice(1)} theme`,
  );
</script>

<button
  type="button"
  onclick={toggleTheme}
  aria-label={label}
  aria-pressed={isDark}
  {title}
  class="inline-flex items-center justify-center rounded {padding} text-neutral-500 transition-colors hover:bg-neutral-200 hover:text-neutral-700 dark:hover:text-neutral-300 dark:text-neutral-400 dark:hover:bg-neutral-700"
>
  {#if isDark}
    <!-- Moon -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class={iconSize}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M21.752 15.002A9.718 9.718 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
      />
    </svg>
  {:else}
    <!-- Sun -->
    <svg
      xmlns="http://www.w3.org/2000/svg"
      class={iconSize}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-width="1.8"
      aria-hidden="true"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
      />
    </svg>
  {/if}
</button>
