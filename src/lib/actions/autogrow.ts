import type { Action } from "svelte/action";

type AutogrowParams = {
  // When false the action is inert, leaving the textarea at its native size.
  enabled?: boolean;
  // Max height in lines before the textarea starts scrolling.
  maxRows?: number;
  // A value to watch; resize is re-run whenever it changes (e.g. after a reset).
  value?: unknown;
};

// Grow a textarea with its content up to maxRows lines, then scroll.
export const autogrow: Action<
  HTMLTextAreaElement,
  AutogrowParams | undefined
> = (node, params) => {
  let enabled = params?.enabled ?? true;
  let maxRows = params?.maxRows ?? 10;

  function resize() {
    if (!enabled) return;
    const cs = getComputedStyle(node);
    const lh = parseFloat(cs.lineHeight) || 20;
    const vPad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const vBorder =
      parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    const max = lh * maxRows + vPad + vBorder;
    node.style.height = "auto";
    const next = Math.min(node.scrollHeight, max);
    node.style.height = `${next}px`;
    node.style.overflowY = node.scrollHeight > max ? "auto" : "hidden";
  }

  node.addEventListener("input", resize);
  resize();

  return {
    update(next) {
      enabled = next?.enabled ?? true;
      maxRows = next?.maxRows ?? 10;
      // Re-run on watched-value changes, including programmatic resets.
      resize();
    },
    destroy() {
      node.removeEventListener("input", resize);
    },
  };
};
