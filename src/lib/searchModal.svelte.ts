let open = $state(false);

// When a page hosts an inline search input (the homepage), it registers a
// focus function here and every search trigger routes to it instead of the
// modal, so a modal input never opens on top of an inline one.
let inlineFocus: (() => void) | null = null;

export const searchModal = {
  get open() {
    return open;
  },
};

export function registerInlineSearch(focus: () => void): () => void {
  inlineFocus = focus;
  return () => {
    if (inlineFocus === focus) inlineFocus = null;
  };
}

export function openSearch() {
  if (inlineFocus) inlineFocus();
  else open = true;
}

export function closeSearch() {
  open = false;
}
