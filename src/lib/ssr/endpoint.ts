import { error, type RequestEvent } from "@sveltejs/kit";
import { CACHE_CONTROL } from "$lib/config";
import { RelayUnavailable } from "./relay";

// Wraps a snapshot endpoint: answers carry the shared cache policy, while a
// relay that could not be asked becomes an uncached 503, which snapshot()
// treats as "no snapshot" so the page hydrates empty and the client takes the
// same path as a client-only build (probe, gate or live fetch).
export function snapshotHandler<E extends RequestEvent>(
  handler: (event: E) => Promise<Response>,
): (event: E) => Promise<Response> {
  return async (event) => {
    try {
      const res = await handler(event);
      event.setHeaders({ "cache-control": CACHE_CONTROL });
      return res;
    } catch (e) {
      const unavailable = e instanceof RelayUnavailable;
      event.setHeaders({
        "cache-control": unavailable ? "no-store" : CACHE_CONTROL,
      });
      if (unavailable) error(503, "Relay unavailable");
      throw e;
    }
  };
}
