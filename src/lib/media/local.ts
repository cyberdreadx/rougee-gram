import { db } from "../db";
import { sha256Hex } from "./hash";
import type { PutResult } from "./types";

/**
 * Local (in-browser) media backend. Stores blobs in IndexedDB keyed by their
 * SHA-256 content hash. Reference form: `local://<hash>`. Great for zero-config
 * development; images live only on this device.
 */

const objectUrlCache = new Map<string, string>();

export async function putLocal(blob: Blob): Promise<PutResult> {
  const hash = await sha256Hex(blob);
  const database = await db();
  const existing = await database.get("media", hash);
  if (!existing) {
    await database.put("media", {
      hash,
      mime: blob.type || "application/octet-stream",
      blob,
      createdAt: Date.now(),
    });
  }
  return {
    ref: `local://${hash}`,
    mime: blob.type || "application/octet-stream",
    size: blob.size,
  };
}

export async function localRefToUrl(ref: string): Promise<string | null> {
  const hash = ref.replace(/^local:\/\//, "");
  const cached = objectUrlCache.get(hash);
  if (cached) return cached;
  const database = await db();
  const rec = await database.get("media", hash);
  if (!rec) return null;
  const url = URL.createObjectURL(rec.blob);
  objectUrlCache.set(hash, url);
  return url;
}
