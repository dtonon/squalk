let open = $state(false);

export const searchModal = {
  get open() {
    return open;
  },
};

export function openSearch() {
  open = true;
}

export function closeSearch() {
  open = false;
}
