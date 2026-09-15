import { getConfig } from "../config";
import { sha256Hex } from "./hash";
import type { PutResult } from "./types";

/**
 * Cloudflare media backend. Uploads blobs (images + video) through a small
 * R2-backed Worker (see workers/media). The Worker stores by content hash and
 * serves reads with range support. R2 = cheap storage + free egress.
 *
 * The returned ref is domain-agnostic: `cf:<objectKey>` (e.g. `cf:media/<hash>.jpg`),
 * NOT an absolute URL. Refs are written into on-chain post envelopes forever, so
 * baking in the Worker's hostname would orphan all media the day the app moves to
 * a new domain (workers.dev -> rougee.app -> …). Instead resolveMediaUrl() joins
 * the ref to the *currently configured* Worker URL at read time, so repointing to
 * a new domain is a one-line config change and every past post follows along.
 */

export function cloudflareEnabled(): boolean {
  return Boolean(getConfig().cfWorkerUrl);
}

function extFor(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webp")) return "webp";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  if (m.includes("quicktime") || m.includes("mov")) return "mov";
  return "bin";
}

export async function putCloudflare(blob: Blob): Promise<PutResult> {
  const { cfWorkerUrl, cfUploadSecret } = getConfig();
  const base = cfWorkerUrl.replace(/\/+$/, "");
  if (!base) throw new Error("No Cloudflare Worker URL configured.");

  const key = await sha256Hex(blob);
  const mime = blob.type || "application/octet-stream";
  const ext = extFor(mime);

  const res = await fetch(`${base}/upload?key=${key}&ext=${ext}`, {
    method: "POST",
    headers: {
      "Content-Type": mime,
      ...(cfUploadSecret ? { "X-Upload-Secret": cfUploadSecret } : {}),
    },
    body: blob,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Cloudflare upload failed (${res.status}): ${text.slice(0, 160)}`);
  }

  const json = (await res.json()) as { url?: string; key?: string };
  // Prefer the content-addressed object key; derive it from the URL for older
  // Workers that only return `url`. Store it domain-agnostically as `cf:<key>`.
  const objectKey =
    json.key ||
    (json.url ? new URL(json.url).pathname.replace(/^\/f\//, "") : "");
  if (!objectKey) throw new Error("Cloudflare upload returned no key.");

  return { ref: `cf:${objectKey}`, mime, size: blob.size };
}

/** Health-check a Worker base URL. */
export async function testCloudflareWorker(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/`, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}
