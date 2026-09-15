/**
 * Client-side video handling: read dimensions/duration and generate a poster
 * frame. We deliberately do NOT transcode (ffmpeg.wasm is ~30MB + slow); instead
 * we accept browser-playable input (MP4/H.264, WebM) and enforce size/duration
 * guardrails. For heavy usage, swap the IPFS MediaStore backend for a streaming
 * service (Livepeer / Cloudflare Stream) — see src/lib/media.
 */

import { canvasToBlob, supportsWebp } from "./image";

export const REEL_MAX_SECONDS = 90;
export const VIDEO_WARN_BYTES = 25 * 1024 * 1024; // 25 MB — soft warn
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100 MB — hard cap

export interface ProcessedVideo {
  /** The original file, unmodified (no transcode). */
  blob: Blob;
  width: number;
  height: number;
  /** Duration in seconds (may be 0/NaN for some sources). */
  duration: number;
  mime: string;
  /** Poster/thumbnail frame, or null if it couldn't be captured. */
  poster: Blob | null;
  /** True when height > width (suggests a reel). */
  isPortrait: boolean;
}

export function isVideoFile(file: File | Blob): boolean {
  return (file.type || "").startsWith("video/");
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export async function processVideo(file: File | Blob): Promise<ProcessedVideo> {
  if (file.size > VIDEO_MAX_BYTES) {
    throw new Error(
      `Video is ${formatBytes(file.size)} — over the ${formatBytes(VIDEO_MAX_BYTES)} limit. Trim or compress it first.`,
    );
  }

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(new Error("Could not read that video — try MP4 (H.264) or WebM."));
    });

    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;

    const poster = await capturePoster(video, width, height).catch(() => null);

    return {
      blob: file,
      width,
      height,
      duration,
      mime: file.type || "video/mp4",
      poster,
      isPortrait: height > width,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function capturePoster(
  video: HTMLVideoElement,
  width: number,
  height: number,
): Promise<Blob | null> {
  const t = Math.min(video.duration && Number.isFinite(video.duration) ? video.duration * 0.1 : 0.1, 1);
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    video.onseeked = done;
    try {
      video.currentTime = t;
    } catch {
      resolve();
    }
    // Fallback in case 'seeked' never fires.
    setTimeout(done, 1500);
  });

  const w = width || 720;
  const h = height || 1280;
  const scale = Math.min(1, 720 / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  try {
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  } catch {
    return null; // drawing can throw if the frame isn't decodable
  }
  const mime = (await supportsWebp()) ? "image/webp" : "image/jpeg";
  return canvasToBlob(canvas, mime, 0.8).catch(() => null as unknown as Blob);
}
