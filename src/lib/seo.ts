// Plain-text excerpt of a markdown body for description meta tags: the first
// paragraph that isn't a heading or a bare media URL, trimmed to `max` chars.
export function excerpt(markdown: string, max = 160): string {
  const lines = markdown.split("\n").map((l) => l.trim());
  const line = lines.find(
    (l) => l && !l.startsWith("#") && !/^https?:\/\/\S+$/.test(l),
  );
  if (!line) return "";
  const text = line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → label
    .replace(/[*_`~]+/g, "")
    .replace(/nostr:([a-z0-9]{12})[a-z0-9]*/g, "@$1…") // keep a short handle
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}
