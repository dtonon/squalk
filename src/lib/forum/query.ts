import type { AbstractRelay } from "@nostr/tools/abstract-relay";
import type { Event } from "@nostr/tools/core";
import type { Filter } from "@nostr/tools/filter";

// A relay read. The fetchers in this folder only depend on this signature, so
// the same code runs behind the browser's authenticated connection and the
// server's anonymous one.
export type Query = (filter: Filter) => Promise<Event[]>;

// Drive a subscription on an already-open relay and resolve at EOSE.
export function relayQuery(relay: AbstractRelay): Query {
  return (filter) =>
    new Promise((resolve) => {
      const events: Event[] = [];
      const sub = relay.subscribe([filter], {
        onevent(e) {
          events.push(e);
        },
        oneose() {
          sub.close();
          resolve(events);
        },
        onclose() {
          resolve(events);
        },
      });
    });
}

export function tag(e: Event, name: string): string | undefined {
  return e.tags.find((t) => t[0] === name)?.[1];
}

export function tags(e: Event, name: string): string[] {
  return e.tags.filter((t) => t[0] === name && t[1]).map((t) => t[1]);
}
