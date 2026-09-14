import { putIpfs, ipfsRefToUrl, ipfsEnabled } from "./ipfs";
import { putLocal, localRefToUrl } from "./local";
import type { MediaBackend, PutResult } from "./types";

export { ipfsEnabled, testPinataJwt } from "./ipfs";
export type { PutResult, MediaBackend } from "./types";

/** Which backend a fresh upload will use, given current config. */
export function activeBackend(): MediaBackend {
  return ipfsEnabled() ? "ipfs" : "local";
}

/**
 * Store an image blob. Uses IPFS when a Pinata JWT is configured, otherwise
 * falls back to the local IndexedDB store.
 */
export async function putImage(
  blob: Blob,
  filename = "photo",
): Promise<PutResult> {
  if (ipfsEnabled()) return putIpfs(blob, filename);
  return putLocal(blob);
}

const urlCache = new Map<string, string>();

/**
 * Resolve a media reference (ipfs://… or local://…) to a displayable URL.
 * Returns null when a local blob isn't present on this device.
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
