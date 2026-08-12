const HIGHLIGHT_NAME = "search-terms";

function supported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Highlight the query inside the given roots using the CSS Custom Highlight
// API, which paints ranges without touching the DOM, so it never conflicts
// with Svelte re-renders. Where the terms appear contiguously as the whole
// query, one range covers the phrase; individual terms are only marked
// outside those. Returns the first match in document order (for scrolling),
// or null. No-op on unsupported browsers.
export function applyHighlights(
  roots: Iterable<Element>,
  query: string,
): Range | null {
  if (!supported()) return null;
  CSS.highlights.delete(HIGHLIGHT_NAME);
  const terms = [
    ...new Set(query.toLowerCase().split(/\s+/).filter((t) => t.length >= 2)),
  ];
  if (terms.length === 0) return null;
  const phraseRe =
    terms.length > 1
      ? new RegExp(terms.map(escapeRe).join("\\s+"), "gi")
      : null;

  const ranges: Range[] = [];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent ?? "";
      const taken: [number, number][] = [];

      if (phraseRe) {
        phraseRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = phraseRe.exec(text))) {
          taken.push([m.index, m.index + m[0].length]);
          const range = new Range();
          range.setStart(node, m.index);
          range.setEnd(node, m.index + m[0].length);
          ranges.push(range);
        }
      }

      const lower = text.toLowerCase();
      for (const term of terms) {
        let i = 0;
        while ((i = lower.indexOf(term, i)) !== -1) {
          const end = i + term.length;
          if (!taken.some(([s, e]) => i < e && end > s)) {
            const range = new Range();
            range.setStart(node, i);
            range.setEnd(node, end);
            ranges.push(range);
          }
          i = end;
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
