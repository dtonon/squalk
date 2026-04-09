import { auth } from "$lib/auth.svelte";
import { BLOSSOM_URL } from "$lib/config";

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// base64url-encode a UTF-8 string, the format expected by Blossom auth headers.
function b64url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export type BlobDescriptor = {
  url: string;
  sha256: string;
  size: number;
  type?: string;
};

export async function uploadImage(file: File): Promise<BlobDescriptor> {
  if (!BLOSSOM_URL) throw new Error("Blossom server not configured");
  if (!auth.signer) throw new Error("Not logged in");

  console.log("[blossom] hashing", file.name, file.size, file.type);
  const buf = await file.arrayBuffer();
  const x = await sha256Hex(buf);
  console.log("[blossom] sha256:", x);

  console.log("[blossom] signing auth event…");
  const signPromise = auth.signer.signEvent({
    kind: 24242,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["t", "upload"],
      ["x", x],
      ["expiration", String(Math.floor(Date.now() / 1000) + 300)],
    ],
    content: `Upload ${file.name}`,
  });
  // Some extensions silently swallow signEvent if a popup is blocked or a
  // previous prompt is still pending. Time out so the UI can recover.
  const signTimeout = new Promise<never>((_, reject) =>
    setTimeout(
      () =>
        reject(
          new Error(
            "Signer didn't respond — check your Nostr extension for a pending approval popup",
          ),
        ),
      60000,
    ),
  );
  const event = await Promise.race([signPromise, signTimeout]);
  console.log("[blossom] auth event signed:", event.id);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  console.log("[blossom] PUT", `${BLOSSOM_URL}/upload`);
  let res: Response;
  try {
    res = await fetch(`${BLOSSOM_URL}/upload`, {
      method: "PUT",
      headers: {
        Authorization: "Nostr " + b64url(JSON.stringify(event)),
        "Content-Type": file.type || "application/octet-stream",
      },
      body: buf,
      signal: controller.signal,
    });
  } catch (e) {
    const err = e as Error;
    console.error("[blossom] fetch failed:", err);
    if (err.name === "AbortError") {
      throw new Error(`Upload timed out — is ${BLOSSOM_URL} reachable?`);
    }
    // A bare TypeError from fetch means the request never completed: server
    // unreachable, mixed content, or CORS preflight rejected. Browsers don't
    // surface CORS rejections as a distinct error, so we hint at it.
    if (err.name === "TypeError") {
      throw new Error(
        `Cannot reach ${BLOSSOM_URL}. Check that the server is running and that CORS allows PUT /upload from this origin.`,
      );
    }
    throw new Error(`Upload request failed: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  console.log("[blossom] response", res.status);
  if (!res.ok) {
    const reason =
      res.headers.get("X-Reason") ||
      (await res.text().catch(() => "")) ||
      res.statusText;
    throw new Error(`Upload failed (${res.status}): ${reason}`);
  }

  try {
    const blob = (await res.json()) as BlobDescriptor;
    console.log("[blossom] uploaded:", blob.url);
    return blob;
  } catch {
    throw new Error("Upload succeeded but response was not valid JSON");
  }
}
