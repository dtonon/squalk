<script lang="ts">
  import { tick } from "svelte";
  import type { SortMode } from "$lib/threads.svelte";

  type Props = { sort: SortMode };
  let { sort }: Props = $props();

  const options: { value: SortMode; label: string; href: string }[] = [
    { value: "active", label: "Recent activity", href: "?sort=active" },
    { value: "new", label: "Newest first", href: "?sort=new" },
  ];

  let open = $state(false);
  let triggerEl = $state<HTMLButtonElement>();
  let menuEl = $state<HTMLDivElement>();

  const currentLabel = $derived(
    options.find((o) => o.value === sort)?.label ?? options[0].label,
  );

  async function openMenu() {
    open = true;
    await tick();
    const current =
      menuEl?.querySelector<HTMLAnchorElement>('[aria-current="true"]') ??
      menuEl?.querySelector<HTMLAnchorElement>("a");
    current?.focus();
  }

  function closeMenu(refocus = false) {
    open = false;
    if (refocus) triggerEl?.focus();
  }

  $effect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (!triggerEl?.contains(t) && !menuEl?.contains(t)) closeMenu();
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu(true);
      }
    }
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKeydown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKeydown, true);
    };
  });
</script>

<div class="relative">
  <button
    bind:this={triggerEl}
    type="button"
    onclick={() => (open ? closeMenu() : openMenu())}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="Sort discussions, current: {currentLabel}"
    class="flex items-center gap-2 rounded bg-neutral-800 px-4 py-1.5 font-medium text-white hover:bg-neutral-700 md:text-sm"
  >
    <svg
      class="h-4 w-4"
      viewBox="0 0 17 17"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M12.6285 16.2714V0.728609L12.6287 0.713924C12.6348 0.406347 12.8339 0.135053 13.1267 0.0374353C13.4242 -0.0617326 13.7518 0.0405917 13.94 0.291467L16.8542 4.17716L16.8653 4.19236C17.0936 4.51329 17.0254 4.95951 16.7085 5.19716C16.3916 5.43481 15.9442 5.37533 15.7 5.06636L15.6885 5.05145L14.0857 2.91429V16.2714C14.0857 16.6738 13.7595 17 13.3571 17C12.9547 17 12.6285 16.6738 12.6285 16.2714ZM9.47141 13.6L9.49022 13.6002C9.8839 13.6102 10.2 13.9325 10.2 14.3286C10.2 14.7247 9.8839 15.0469 9.49022 15.0569L9.47141 15.0572H4.61427C4.2119 15.0572 3.8857 14.731 3.8857 14.3286C3.8857 13.9262 4.21189 13.6 4.61427 13.6H9.47141ZM9.47141 8.74288L9.49022 8.7431C9.8839 8.75308 10.2 9.07536 10.2 9.47145C10.2 9.86753 9.8839 10.1898 9.49022 10.1998L9.47141 10.2H2.67143C2.26905 10.2 1.94286 9.87382 1.94286 9.47145C1.94286 9.06907 2.26905 8.74288 2.67143 8.74288H9.47141ZM9.47141 3.88574L9.49022 3.88599C9.8839 3.89597 10.2 4.21822 10.2 4.6143C10.2 5.01039 9.8839 5.33267 9.49022 5.34265L9.47141 5.34287H0.72857C0.326192 5.34287 0 5.01668 0 4.6143C5.28744e-06 4.21193 0.326195 3.88574 0.72857 3.88574H9.47141Z"
      />
    </svg>
    <span>{currentLabel}</span>
    <svg
      class="h-3 w-3 opacity-70"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M3 4.5L6 7.5L9 4.5" />
    </svg>
  </button>

  <div
    bind:this={menuEl}
    role="menu"
    aria-label="Sort discussions"
    class="absolute right-0 z-10 mt-1 min-w-48 rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 py-1 shadow-lg {open
      ? 'block'
      : 'hidden'}"
  >
    {#each options as o}
      <a
        href={o.href}
        role="menuitem"
        aria-current={o.value === sort ? "true" : undefined}
        onclick={() => closeMenu()}
        class="flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 {o.value ===
        sort
          ? 'font-semibold text-neutral-900 dark:text-neutral-100'
          : 'text-neutral-600 dark:text-neutral-400'}"
      >
        <span class="w-4 text-center" aria-hidden="true"
          >{o.value === sort ? "✓" : ""}</span
        >
        {o.label}
      </a>
    {/each}
  </div>
</div>
