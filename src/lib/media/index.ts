import { putIpfs, ipfsRefToUrl, ipfsEnabled } from "./ipfs";
import { putCloudflare, cloudflareEnabled } from "./cloudflare";
import { putLocal, localRefToUrl } from "./local";
import type { MediaBackend, PutResult } from "./types";

export { ipfsEnabled, testPinataJwt } from "./ipfs";
export { cloudflareEnabled, testCloudflareWorker } from "./cloudflare";
export { streamEnabled, putStream } from "./stream";
export type { PutResult, MediaBackend } from "./types";

/** Which backend a fresh upload will use, given current config.
 *  Priority: Cloudflare R2 → IPFS (Pinata) → local (IndexedDB dev fallback). */
export function activeBackend(): MediaBackend {
  if (cloudflareEnabled()) return "cloudflare";
  if (ipfsEnabled()) return "ipfs";
  return "local";
}

/**
 * Store a media blob (image or video). Routes to the active backend.
 */
export async function putImage(
  blob: Blob,
  filename = "media",
): Promise<PutResult> {
  if (cloudflareEnabled()) return putCloudflare(blob);
  if (ipfsEnabled()) return putIpfs(blob, filename);
  return putLocal(blob);
}

/** Alias — media (image or video) all flow through the same path. */
export const putMedia = putImage;

const urlCache = new Map<string, string>();

/**
 * Resolve a media reference to a displayable URL.
 * - http(s)/data URIs (Cloudflare R2, external): passed through
 * - ipfs://<cid>: gateway URL
 * - local://<hash>: object URL from IndexedDB (null if not on this device)
 */
export async function resolveMediaUrl(ref: string): Promise<string | null> {
  if (!ref) return null;
  if (ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("data:")) {
    return ref;
  }
  if (ref.startsWith("ipfs://")) {
    const url = ipfsRefToUrl(ref);
    urlCache.set(ref, url);
    return url;
  }
  if (ref.startsWith("local://")) {
    const cached = urlCache.get(ref);
    if (cached) return cached;
    const url = await localRefToUrl(ref);
    if (url) urlCache.set(ref, url);
    return url;
  }
  return null;
}
