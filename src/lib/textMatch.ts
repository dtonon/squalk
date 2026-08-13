// Shared matching rules for search highlighting and ranking. The query is
// tokenized on any non-alphanumeric character (so "-_|!./" all act as word
// separators, in the query and in the text), and a token matches where a
// word starts or ends with it — "id" marks "id" or "identify" but never the
// middle of "gravida", while still allowing prefix searches like the first
// characters of an npub.

export type Span = { start: number; end: number };

// Separator between adjacent tokens of a run: one or more non-word chars
const SEP = "[^\\p{L}\\p{N}]+";

export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

// Start-with or end-with: the match must begin at a word start or finish at
// a word end.
function validBoundaries(text: string, span: Span): boolean {
  return !isWordChar(text[span.start - 1]) || !isWordChar(text[span.end]);
}

function overlaps(taken: Span[], s: Span): boolean {
  return taken.some((t) => s.start < t.end && s.end > t.start);
}

// All spans where the given tokens appear consecutively (any separators
// between them). Tokens are alphanumeric-only, so no regex escaping needed.
function findRuns(text: string, tokens: string[]): Span[] {
  const re = new RegExp(tokens.join(SEP), "giu");
  const out: Span[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const span = { start: m.index, end: m.index + m[0].length };
    if (validBoundaries(text, span)) out.push(span);
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

// Occurrences of the whole query as one contiguous phrase
export function findPhraseSpans(text: string, query: string): Span[] {
  const tokens = tokenize(query);
  if (tokens.length < 2) return [];
  return findRuns(text, tokens);
}

// Fallback matches: longest contiguous multi-token runs claim their spans
// first (each painted as one block), then single tokens outside them.
export function findMatchSpans(text: string, query: string): Span[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const spans: Span[] = [];
  for (let len = tokens.length; len >= 2; len--) {
    for (let s = 0; s + len <= tokens.length; s++) {
      for (const span of findRuns(text, tokens.slice(s, s + len))) {
        if (!overlaps(spans, span)) spans.push(span);
      }
    }
  }
  for (const t of new Set(tokens)) {
    for (const span of findRuns(text, [t])) {
      if (!overlaps(spans, span)) spans.push(span);
    }
  }
  return spans.sort((a, b) => a.start - b.start);
}

// Rank how well a text matches the query, and where to anchor an excerpt:
// the full query (1000) beats any shorter contiguous run (100 + length),
// which beats scattered singles (count of distinct tokens inside a window of
// `windowSpan` chars, always < 100).
export function bestMatch(
  text: string,
  query: string,
  windowSpan: number,
): { anchor: number; score: number } {
  const tokens = tokenize(query);
  if (tokens.length === 0) return { anchor: -1, score: 0 };

  for (let len = tokens.length; len >= 2; len--) {
    for (let s = 0; s + len <= tokens.length; s++) {
      const runs = findRuns(text, tokens.slice(s, s + len));
      if (runs.length > 0)
        return {
          anchor: runs[0].start,
          score: len === tokens.length ? 1000 : 100 + len,
        };
    }
  }

  const singles: { start: number; token: string }[] = [];
  for (const t of new Set(tokens)) {
    for (const span of findRuns(text, [t]))
      singles.push({ start: span.start, token: t });
  }
  if (singles.length === 0) return { anchor: -1, score: 0 };
  singles.sort((a, b) => a.start - b.start);

  let anchor = singles[0].start;
  let score = 0;
  for (const o of singles) {
    const seen = new Set<string>();
    for (const p of singles) {
      if (p.start >= o.start && p.start <= o.start + windowSpan)
        seen.add(p.token);
    }
    if (seen.size > score) {
      score = seen.size;
      anchor = o.start;
    }
  }
  return { anchor, score };
}
