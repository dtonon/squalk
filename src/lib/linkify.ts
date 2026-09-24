import * as nip19 from "@nostr/tools/nip19";
import { RELAY_URL, externalLink } from "./config";

// Curated TLD list: gTLDs, popular new gTLDs, common ccTLDs
const TLDS = [
  "com",
  "org",
  "net",
  "edu",
  "gov",
  "mil",
  "int",
  "info",
  "biz",
  "name",
  "pro",
  "io",
  "co",
  "app",
  "dev",
  "ai",
  "sh",
  "me",
  "ly",
  "tv",
  "fm",
  "lol",
  "club",
  "online",
  "site",
  "store",
  "blog",
  "tech",
  "xyz",
  "art",
  "design",
  "news",
  "media",
  "page",
  "link",
  "fun",
  "gg",
  "gl",
  "st",
  "to",
  "run",
  "life",
  "world",
  "space",
  "cloud",
  "email",
  "social",
  "chat",
  "wtf",
  "cafe",
  "zone",
  "studio",
  "us",
  "uk",
  "de",
  "fr",
  "it",
  "es",
  "nl",
  "ru",
  "jp",
  "cn",
  "ca",
  "au",
  "br",
  "in",
  "mx",
  "se",
  "no",
  "fi",
  "dk",
  "ch",
  "at",
  "be",
  "pl",
  "pt",
  "gr",
  "cz",
  "ie",
  "nz",
  "kr",
  "sg",
  "hk",
  "tw",
  "za",
  "cc",
  "ws",
  "eu",
  "tr",
  "ua",
  "il",
  "ar",
  "cl",
  "pe",
].join("|");

// Matches nostr entities, http(s) URLs, and bare domains
const URL_SOURCE = `nostr:(?:npub1|nprofile1|note1|nevent1|naddr1)[a-z0-9]+|https?:\\/\\/[^\\s<>"']+|(?<![\\w@.\\/])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})\\b(?:[\\/?#][^\\s<>"']*)?`;
// Trailing punctuation that is usually not part of the URL
const TRAILING_PUNCT_RE = /[).,;:!?'"]+$/;

export type ChatToken =
  | { type: "text"; value: string }
  | { type: "link"; href: string; label: string }
  | { type: "mention"; pubkey: string; entity: string; fallback: string }
  | {
      type: "entity";
      entity: string;
      href: string;
      label: string;
      // Underlying event id for note/nevent — used to resolve a forum thread.
      id?: string;
    };

// Shorten a nostr entity to xxxxxxxx...xxxx
export function shortNostrEntity(entity: string): string {
  if (entity.length <= 12) return entity;
  return `${entity.slice(0, 8)}...${entity.slice(-4)}`;
}

// Shorten a URL to domain.tld/...last-10-chars-of-the-final-part
export function shortUrl(href: string): string {
  const rest = href.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  const slash = rest.indexOf("/");
  if (slash === -1) return rest;
  const host = rest.slice(0, slash);
  const path = rest.slice(slash + 1);
  if (path === "") return host;
  const finalPart = path.slice(path.lastIndexOf("/") + 1);
  const tail = finalPart.length > 10 ? finalPart.slice(-10) : finalPart;
  return `${host}/...${tail}`;
}

function decodeEntity(entity: string): ChatToken | null {
  try {
    const decoded = nip19.decode(entity);
    if (decoded.type === "npub")
      return {
        type: "mention",
        pubkey: decoded.data,
        entity,
        fallback: shortNostrEntity(entity),
      };
    if (decoded.type === "nprofile")
      return {
        type: "mention",
        pubkey: decoded.data.pubkey,
        entity,
        fallback: shortNostrEntity(entity),
      };
    if (decoded.type === "note" || decoded.type === "nevent")
      return {
        type: "entity",
        entity,
        href: externalLink(entity),
        label: shortNostrEntity(entity),
        id: decoded.type === "note" ? decoded.data : decoded.data.id,
      };
    if (decoded.type === "naddr")
      return {
        type: "entity",
        entity,
        href: externalLink(entity),
        label: shortNostrEntity(entity),
      };
  } catch {
    // Invalid bech32, fall through to text
  }
  return null;
}

// Tokenize a plain-text chat message into text, links, mentions and entities.
// Image URLs are treated as plain links (never embedded).
export function tokenizeChat(content: string): ChatToken[] {
  const out: ChatToken[] = [];
  let last = 0;
  const re = new RegExp(URL_SOURCE, "gi");
  for (const m of content.matchAll(re)) {
    const start = m.index ?? 0;
    let raw = m[0];
    const isNostr = /^nostr:/i.test(raw);
    let trailing = "";
    if (!isNostr) {
      const trail = raw.match(TRAILING_PUNCT_RE);
      if (trail) {
        trailing = trail[0];
        raw = raw.slice(0, -trailing.length);
      }
    }
    if (start > last)
      out.push({ type: "text", value: content.slice(last, start) });
    if (isNostr) {
      const entity = raw.slice(6).toLowerCase();
      const token = decodeEntity(entity);
      out.push(token ?? { type: "text", value: m[0] });
    } else {
      const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      out.push({ type: "link", href, label: shortUrl(href) });
      if (trailing) out.push({ type: "text", value: trailing });
    }
    last = start + m[0].length;
  }
  if (last < content.length)
    out.push({ type: "text", value: content.slice(last) });
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Rewrite same-origin forum thread URLs into nostr entities before publishing,
// so the reference is portable to other Nostr clients. A `#post-<id>` fragment
// targets the reply (kind 1111); otherwise the thread itself (kind 11). The
// author is omitted; the parent is recovered from the reply's own tags on read.
export function convertForumUrls(content: string): string {
  if (typeof window === "undefined") return content;
  const re = new RegExp(
    `${escapeRegExp(window.location.origin)}/thread/([0-9a-f]{64})\\/?(?:#post-([0-9a-f]{64}))?`,
    "g",
  );
  return content.replace(re, (whole, threadId, replyId) => {
    try {
      const nevent = replyId
        ? nip19.neventEncode({ id: replyId, kind: 1111, relays: [RELAY_URL] })
        : nip19.neventEncode({ id: threadId, kind: 11, relays: [RELAY_URL] });
      return `nostr:${nevent}`;
    } catch {
      return whole;
    }
  });
}
