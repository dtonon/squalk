let message = $state<string | null>(null);
let timer: ReturnType<typeof setTimeout> | null = null;

export const toastStore = {
  get message() {
    return message;
  },
};

export function showToast(msg: string, duration = 3500) {
  message = msg;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    message = null;
    timer = null;
  }, duration);
}

export function dismissToast() {
  if (timer) clearTimeout(timer);
  timer = null;
  message = null;
}
