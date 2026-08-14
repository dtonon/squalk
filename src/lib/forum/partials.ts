import { tag, type Query } from "./query";

export type PartialSlot = "home" | "contacts";
const SLOTS = new Set<string>(["home", "contacts"]);

export type Partial = {
  id: string;
  slot: PartialSlot;
  title: string;
  content: string; // markdown body
  pubkey: string;
  createdAt: number;
};

// Every `squalk-partial` event for a known slot. Not admin-filtered nor
// reduced to the newest per slot: both depend on the admin set.
export async function fetchPartials(q: Query): Promise<Partial[]> {
  const events = await q({ kinds: [30023], "#t": ["squalk-partial"] });
  const out: Partial[] = [];
  for (const e of events) {
    const slot = tag(e, "d");
    if (!slot || !SLOTS.has(slot)) continue;
    out.push({
      id: e.id,
      slot: slot as PartialSlot,
      title: tag(e, "title") ?? slot,
      content: e.content,
      pubkey: e.pubkey,
      createdAt: e.created_at,
    });
  }
  return out;
}

// The newest admin-authored partial for a slot.
export function pickPartial(
  all: Partial[],
  slot: PartialSlot,
  admins: string[],
): Partial | undefined {
  const set = new Set(admins);
  let best: Partial | undefined;
  for (const p of all) {
    if (p.slot !== slot || !set.has(p.pubkey)) continue;
    if (!best || p.createdAt > best.createdAt) best = p;
  }
  return best;
}
