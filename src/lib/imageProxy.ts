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

/** Hosts known to block the proxy (it gets a 404/403), so their images go
 *  direct right away instead of failing first. Hosts that fail at runtime are
 *  remembered on this device too. */
const BLOCKED_HOSTS_KEY = "rougee:img-proxy-skip";
const SKIP_TTL_MS = 7 * 24 * 3600 * 1000; // re-try learned hosts weekly
const skipHosts = new Set<string>(["cdn.midjourney.com"]);
let learned: Record<string, number> = {};
try {
  const raw = JSON.parse(localStorage.getItem(BLOCKED_HOSTS_KEY) || "{}");
  if (raw && !Array.isArray(raw)) learned = raw;
  for (const [h, ts] of Object.entries(learned)) {
    if (Date.now() - ts < SKIP_TTL_MS) skipHosts.add(h);
    else delete learned[h];
  }
} catch {
  /* unavailable */
}
const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
};
/** Per-host proxy failures this session; 2 strikes and the host goes direct. */
const hostStrikes = new Map<string, number>();
function strike(original: string) {
  const h = hostOf(original);
  if (!h || skipHosts.has(h)) return;
  const n = (hostStrikes.get(h) ?? 0) + 1;
  hostStrikes.set(h, n);
  if (n < 2) return;
  skipHosts.add(h);
  learned[h] = Date.now();
  try {
    localStorage.setItem(BLOCKED_HOSTS_KEY, JSON.stringify(learned));
  } catch {
    /* ignore */
  }
}

/** A resized URL for `src` at `width` CSS px (doubled for sharp screens). */
export function proxiedImage(src: string | undefined, width: number): string | undefined {
  if (!src || !enabled || failed.has(src)) return src;
  if (!/^https?:\/\//i.test(src)) return src; // data:, blob:, relative
  if (/\.svg($|\?)/i.test(src)) return src; // vector — already tiny
  if (src.startsWith(PROXY)) return src;
  if (skipHosts.has(hostOf(src))) return src;
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
  strike(original);
  img.src = original;
  return true;
}
