/**
 * Resized images for remote (mostly Nostr) media. Nostr posts link straight to
 * the uploader's original file, often several MB (a 3.2 MB photo measured in
 * Discover). Routing them through an image proxy (wsrv.nl by default — free,
 * cached on Cloudflare's edge) serves a WebP at the size we display, typically
 * 20–50× smaller. Always pair with `onProxyError` so a proxy hiccup falls back
 * to the original URL.
 *
 * Set VITE_IMAGE_PROXY to another wsrv-compatible base, or "off" to disable.
 */
const PROXY = (import.meta.env.VITE_IMAGE_PROXY as string | undefined) ?? "https://wsrv.nl/";
const enabled = PROXY !== "off" && PROXY !== "";

/** URLs whose proxied copy failed — use the original from then on. */
const failed = new Set<string>();

/** A resized URL for `src` at `width` CSS px (doubled for sharp screens). */
export function proxiedImage(src: string | undefined, width: number): string | undefined {
  if (!src || !enabled || failed.has(src)) return src;
  if (!/^https?:\/\//i.test(src)) return src; // data:, blob:, relative
  if (/\.svg($|\?)/i.test(src)) return src; // vector — already tiny
  if (src.startsWith(PROXY)) return src;
  const dpr = typeof window !== "undefined" ? Math.min(2, window.devicePixelRatio || 1) : 2;
  const w = Math.round(Math.min(1600, width * dpr));
  const gif = /\.gif($|\?)/i.test(src);
  const params = new URLSearchParams({
    url: src,
    w: String(w),
    we: "", // never upscale small images
    output: "webp",
    q: "78",
  });
  if (gif) params.set("n", "-1"); // keep every frame of animated GIFs
  return `${PROXY.replace(/\/?$/, "/")}?${params.toString().replace("we=&", "we&")}`;
}

/**
 * onError handler for <img>: if the proxied copy fails, swap to the original
 * once (and remember it), then let the caller's own error handling run.
 * Returns true when it swapped.
 */
export function onProxyError(img: HTMLImageElement, original: string): boolean {
  if (!enabled || failed.has(original) || img.src === original) return false;
  failed.add(original);
  img.src = original;
  return true;
}
