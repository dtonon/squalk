import {
  findPhraseSpans,
  findMatchSpans,
  tokenize,
  type Span,
} from "$lib/textMatch";

const HIGHLIGHT_NAME = "search-terms";

function supported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

// Highlight the query inside the given roots using the CSS Custom Highlight
// API, which paints ranges without touching the DOM, so it never conflicts
// with Svelte re-renders. When the whole query appears contiguously anywhere
// on the page, only those phrase occurrences are painted; otherwise the
// textMatch fallback (contiguous runs as blocks, then single words) is used.
// Returns the first match in document order (for scrolling), or null. No-op
// on unsupported browsers.
export function applyHighlights(
  roots: Iterable<Element>,
  query: string,
): Range | null {
  if (!supported()) return null;
  CSS.highlights.delete(HIGHLIGHT_NAME);
  if (tokenize(query).length === 0) return null;

  const nodes: Node[] = [];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) nodes.push(node);
  }

  let perNode: Span[][] = nodes.map((n) =>
    findPhraseSpans(n.textContent ?? "", query),
  );
  if (perNode.every((spans) => spans.length === 0)) {
    perNode = nodes.map((n) => findMatchSpans(n.textContent ?? "", query));
  }

  const ranges: Range[] = [];
  nodes.forEach((node, i) => {
    for (const span of perNode[i]) {
      const range = new Range();
      range.setStart(node, span.start);
      range.setEnd(node, span.end);
      ranges.push(range);
    }
  });
  if (ranges.length === 0) return null;

  CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(...ranges));
  ranges.sort((a, b) => a.compareBoundaryPoints(Range.START_TO_START, b));
  return ranges[0];
}

export function clearHighlights() {
  if (supported()) CSS.highlights.delete(HIGHLIGHT_NAME);
}
