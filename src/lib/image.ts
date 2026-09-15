/**
 * Client-side image processing: decode, optionally square-crop, downscale, and
 * re-encode to WebP/JPEG before upload. Keeps uploads small and strips most
 * metadata (canvas re-encode drops EXIF, including GPS).
 */

export interface ProcessedImage {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
}

export interface ProcessOptions {
  /** Max width/height in px (default 1440). */
  maxSize?: number;
  /** Crop to a centered square (Instagram-style) — default false. */
  square?: boolean;
  /** Output quality 0..1 (default 0.82). */
  quality?: number;
}

export async function processImage(
  file: File | Blob,
  opts: ProcessOptions = {},
): Promise<ProcessedImage> {
  const { maxSize = 1440, square = false, quality = 0.82 } = opts;

  const bitmap = await loadBitmap(file);
  const srcW = bitmap.width;
  const srcH = bitmap.height;

  let sx = 0;
  let sy = 0;
  let sw = srcW;
  let sh = srcH;

  if (square) {
    const side = Math.min(srcW, srcH);
    sx = Math.round((srcW - side) / 2);
    sy = Math.round((srcH - side) / 2);
    sw = side;
    sh = side;
  }

  const scale = Math.min(1, maxSize / Math.max(sw, sh));
  const dw = Math.max(1, Math.round(sw * scale));
  const dh = Math.max(1, Math.round(sh * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, dw, dh);
  if ("close" in bitmap) (bitmap as ImageBitmap).close?.();

  const mime = (await supportsWebp()) ? "image/webp" : "image/jpeg";
  const blob = await canvasToBlob(canvas, mime, quality);

  return { blob, width: dw, height: dh, mime };
}

async function loadBitmap(file: File | Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> decode */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image."))),
      mime,
      quality,
    );
  });
}

let webpSupport: boolean | null = null;
export async function supportsWebp(): Promise<boolean> {
  if (webpSupport !== null) return webpSupport;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  webpSupport = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  return webpSupport;
}
