import { getConfig } from "./config";

/**
 * Client for the RouGee mux service (workers/../services/mux on Fly.io): bakes a
 * reel's chosen track into the video as ONE file, so playback is a single media
 * element with one clock — perfect A/V sync, no separate <audio>.
 *
 * On-chain posts are immutable (no edit), so this runs synchronously at post
 * time: the composer sends the video + the track's URL + offsets, the service
 * returns a muxed media ref already stored in R2, and the post is created with
 * that ref + the `mx` envelope flag. Dormant until VITE_MUX_WORKER_URL is set —
 * callers fall back to the two-element mixing path.
 */
export function muxEnabled(): boolean {
  return Boolean(getConfig().muxWorkerUrl);
}

function base(): string {
  return getConfig().muxWorkerUrl.replace(/\/+$/, "");
}

export interface MuxResult {
  /** Content-addressed media ref (`cf:media/<sha>.mp4`) of the muxed file. */
  ref: string;
  mime: string;
}

/**
 * Bake `audioUrl` (seeked to `start`) into `video`, trimmed to [trimStart,
 * trimEnd], and store the result. Returns null on any failure so the caller can
 * fall back to the un-muxed two-element path (never blocks a post).
 */
export async function muxReel(opts: {
  video: Blob;
  audioUrl: string;
  start?: number;
  trimStart?: number;
  trimEnd?: number;
}): Promise<MuxResult | null> {
  if (!muxEnabled() || !opts.audioUrl) return null;
  try {
    const fd = new FormData();
    fd.append("video", opts.video, "reel");
    fd.append("audioUrl", opts.audioUrl);
    fd.append("start", String(opts.start ?? 0));
    if (opts.trimStart) fd.append("trimStart", String(opts.trimStart));
    if (opts.trimEnd) fd.append("trimEnd", String(opts.trimEnd));
    const res = await fetch(`${base()}/mux`, { method: "POST", body: fd });
    if (!res.ok) return null;
    const j = (await res.json()) as { ref?: string; mime?: string };
    return j.ref ? { ref: j.ref, mime: j.mime || "video/mp4" } : null;
  } catch {
    return null;
  }
}
