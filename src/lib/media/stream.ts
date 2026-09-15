import { getConfig } from "../config";

/**
 * Cloudflare Stream backend for adaptive HLS video. The Worker (workers/media
 * /stream) proxies the upload to the Stream API and returns an HLS playback URL
 * + auto-generated thumbnail. Playback uses hls.js (see MediaVideo).
 *
 * Requires the Worker to be configured with CF_ACCOUNT_ID + CF_STREAM_TOKEN
 * secrets, and the user to opt in (Settings → "Use Cloudflare Stream").
 */

export function streamEnabled(): boolean {
  const c = getConfig();
  return c.cfStream && !!c.cfWorkerUrl;
}

export interface StreamResult {
  hls: string;
  thumbnail?: string;
  uid: string;
}

export async function putStream(blob: Blob): Promise<StreamResult> {
  const { cfWorkerUrl, cfUploadSecret } = getConfig();
  const base = cfWorkerUrl.replace(/\/+$/, "");
  if (!base) throw new Error("No Cloudflare Worker URL configured.");

  const res = await fetch(`${base}/stream`, {
    method: "POST",
    headers: {
      "Content-Type": blob.type || "video/mp4",
      ...(cfUploadSecret ? { "X-Upload-Secret": cfUploadSecret } : {}),
    },
    body: blob,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Stream upload failed (${res.status}): ${text.slice(0, 160)}`);
  }
  const json = (await res.json()) as { hls?: string; thumbnail?: string; uid?: string };
  if (!json.hls) throw new Error("Stream upload returned no playback URL.");
  return { hls: json.hls, thumbnail: json.thumbnail, uid: json.uid ?? "" };
}
