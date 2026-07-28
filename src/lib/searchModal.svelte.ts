let open = $state(false);

export const searchModal = {
  get open() {
    return open;
  },
};

// When the page hosts an inline search input (the homepage), every search
// trigger focuses it instead of opening the modal, so a modal input never
// opens on top of an inline one. Resolved through the DOM rather than a
// registration callback: it needs no lifecycle bookkeeping and stays correct
// even if HMR instantiates this module twice in dev.
export function openSearch() {
  const inline = document.querySelector<HTMLInputElement>(
    "[data-search-inline]",
  );
  if (inline) inline.focus();
  else open = true;
}

export function closeSearch() {
  open = false;
}
