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

/**
 * Upload a video STRAIGHT to Cloudflare Stream (not through the Worker), so the
 * Worker's ~100MB request-body limit never applies — large clips are bounded
 * only by `maxDurationSeconds`. The Worker mints a one-time tus upload URL; we
 * tus-upload the file directly to Stream in chunks (with progress), then poll
 * until Stream has transcoded it and return the HLS URL + thumbnail.
 */
export async function putStreamDirect(
  blob: Blob,
  opts: { maxDurationSeconds?: number; onProgress?: (fraction: number) => void } = {},
): Promise<StreamResult> {
  const { cfWorkerUrl, cfUploadSecret } = getConfig();
  const base = cfWorkerUrl.replace(/\/+$/, "");
  if (!base) throw new Error("No Cloudflare Worker URL configured.");

  // 1. Mint a one-time direct-upload (tus) URL.
  const createRes = await fetch(`${base}/stream/direct`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cfUploadSecret ? { "X-Upload-Secret": cfUploadSecret } : {}),
    },
    body: JSON.stringify({ bytes: blob.size, maxDurationSeconds: opts.maxDurationSeconds ?? 180 }),
  });
  if (!createRes.ok) {
    const t = await createRes.text().catch(() => "");
    throw new Error(`Couldn't start the upload (${createRes.status}): ${t.slice(0, 160)}`);
  }
  const { uploadURL, uid } = (await createRes.json()) as { uploadURL?: string; uid?: string };
  if (!uploadURL || !uid) throw new Error("Upload server returned no destination.");

  // 2. tus upload in 50 MiB chunks (must be a multiple of 256 KiB, except last).
  //    Resilient to flaky/slow connections: a failed chunk backs off and resumes
  //    from wherever the server actually got to (HEAD → Upload-Offset), rather
  //    than restarting the whole upload — the point of a resumable protocol.
  const CHUNK = 50 * 1024 * 1024;
  const MAX_FAILS = 8;
  let offset = 0;
  let fails = 0;
  while (offset < blob.size) {
    const end = Math.min(offset + CHUNK, blob.size);
    try {
      const res = await fetch(uploadURL, {
        method: "PATCH",
        headers: {
          "Tus-Resumable": "1.0.0",
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        body: blob.slice(offset, end),
      });
      if (res.status !== 204 && res.status !== 200) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reported = Number(res.headers.get("Upload-Offset"));
      offset = Number.isFinite(reported) && reported > offset ? reported : end;
      opts.onProgress?.(offset / blob.size);
    } catch (e) {
      if (++fails > MAX_FAILS) {
        throw new Error(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
      }
      await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * fails)));
      const serverOffset = await tusOffset(uploadURL);
      if (serverOffset != null) offset = Math.max(offset, serverOffset); // resume
    }
  }

  // 3. Poll until Stream finishes transcoding (or errors / times out).
  const DEADLINE = 5 * 60 * 1000; // give large clips time to process
  const start = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 2500));
    const sres = await fetch(`${base}/stream/status?uid=${encodeURIComponent(uid)}`);
    const s = (await sres.json().catch(() => ({}))) as {
      ready?: boolean;
      hls?: string;
      thumbnail?: string;
      error?: string;
    };
    if (s.error) throw new Error(`Video processing failed: ${s.error}`);
    if (s.ready && s.hls) return { hls: s.hls, thumbnail: s.thumbnail, uid };
    if (Date.now() - start > DEADLINE) {
      throw new Error("Video is still processing — try again in a moment.");
    }
  }
}

/** Current server-side upload offset for a tus session (for resume), or null. */
async function tusOffset(uploadURL: string): Promise<number | null> {
  try {
    const r = await fetch(uploadURL, { method: "HEAD", headers: { "Tus-Resumable": "1.0.0" } });
    if (!r.ok) return null;
    const o = Number(r.headers.get("Upload-Offset"));
    return Number.isFinite(o) ? o : null;
  } catch {
    return null;
  }
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
