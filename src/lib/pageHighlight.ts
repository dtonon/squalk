const HIGHLIGHT_NAME = "search-terms";

function supported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

// Highlight every occurrence of the terms inside the given roots using the
// CSS Custom Highlight API, which paints ranges without touching the DOM, so
// it never conflicts with Svelte re-renders. Returns the first match in
// document order (for scrolling), or null. No-op on unsupported browsers.
export function applyHighlights(
  roots: Iterable<Element>,
  terms: string[],
): Range | null {
  if (!supported()) return null;
  CSS.highlights.delete(HIGHLIGHT_NAME);
  const lowers = [...new Set(terms.map((t) => t.toLowerCase()))].filter(
    (t) => t.length >= 2,
  );
  if (lowers.length === 0) return null;

  const ranges: Range[] = [];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const lower = (node.textContent ?? "").toLowerCase();
      for (const term of lowers) {
        let i = 0;
        while ((i = lower.indexOf(term, i)) !== -1) {
          const range = new Range();
          range.setStart(node, i);
          range.setEnd(node, i + term.length);
          ranges.push(range);
          i += term.length;
        }
      }
    }
  }
  if (ranges.length === 0) return null;

  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
  ranges.sort((a, b) => a.compareBoundaryPoints(Range.START_TO_START, b));
  return ranges[0];
}

export function clearHighlights() {
  if (supported()) CSS.highlights.delete(HIGHLIGHT_NAME);
}
