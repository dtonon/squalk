// Markdown inline syntax reduced to plain text.
function stripInline(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → label
    .replace(/[*_`~]+/g, "")
    .replace(/nostr:([a-z0-9]{12})[a-z0-9]*/g, "@$1…") // keep a short handle
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

function isProse(line: string): boolean {
  return !!line && !line.startsWith("#") && !/^https?:\/\/\S+$/.test(line);
}

// Plain-text excerpt of a markdown body for description meta tags: the first
// paragraph that isn't a heading or a bare media URL, trimmed to `max` chars.
export function excerpt(markdown: string, max = 160): string {
  const line = markdown
    .split("\n")
    .map((l) => l.trim())
    .find(isProse);
  return line ? truncate(stripInline(line), max) : "";
}

// The whole body flattened to one plain-text line, trimmed to `max` chars.
// Headings, bare media URLs, code blocks, quoted text and list markers are
// dropped, so a reply reads as its own words.
export function summarize(markdown: string, max = 200): string {
  let inCode = false;
  const lines: string[] = [];
  for (const raw of markdown.split("\n")) {
    const l = raw.trim();
    if (l.startsWith("```")) {
      inCode = !inCode;
      continue;
    }
    if (inCode || l.startsWith(">")) continue;
    const line = l.replace(/^(?:[-*+]\s+|\d+[.)]\s+)+/, "");
    if (isProse(line)) lines.push(line);
  }
  return truncate(stripInline(lines.join(" ")), max);
}
