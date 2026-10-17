/**
 * In-session media prefetch. As the feed renders, we warm the browser cache for
 * posts just ahead of where the viewer is, so scrolling to them — and tapping
 * in — feels instant instead of showing a skeleton while the image/video loads.
 *
 * Deliberately data-light: images are prefetched in full (they're small and are
 * what the grid/feed shows immediately), but videos only prefetch their POSTER
 * plus warm the HLS manifest — never the clip's bytes — so we don't burn a
 * viewer's mobile data pulling clips they may scroll right past. The open TCP/TLS
 * connection (see the preconnect hints in index.html) covers the rest.
 */
import { resolveMediaUrl } from "./media";
import { decodeBody } from "./envelope";
import { isNostrPost, type FeedPost } from "./nostrFeed";

// Refs/urls already warmed this session — prefetch is idempotent and cheap to
// call repeatedly (e.g. on every feed re-render).
const warmed = new Set<string>();

/** Warm a resolved http(s) url by letting the browser fetch + cache the image. */
function warmImageUrl(url: string): void {
  if (!url || warmed.has(url)) return;
  warmed.add(url);
  const img = new Image();
  img.decoding = "async";
  img.src = url; // fire-and-forget; browser caches the response
}

/** Prefetch a media ref (cf:/ipfs:/local:/http) as an image. */
export function prefetchImage(ref: string): void {
  if (!ref || warmed.has(ref)) return;
  warmed.add(ref);
  resolveMediaUrl(ref)
    .then((url) => {
      if (url) warmImageUrl(url);
    })
    .catch(() => {});
}

/** Prefetch a video's poster + warm its HLS manifest (not the clip bytes). */
export function prefetchVideo(ref: string, poster?: string): void {
  if (poster) prefetchImage(poster);
  if (!ref || warmed.has(ref)) return;
  warmed.add(ref);
  resolveMediaUrl(ref)
    .then((url) => {
      if (!url) return;
      // HLS manifest is tiny; fetching it warms the CDN edge for a faster first
      // frame. Non-HLS files are left to poster + preconnect to spare data.
      if (/\.m3u8($|\?)/i.test(url)) {
        fetch(url, { mode: "cors" }).catch(() => {});
      }
    })
    .catch(() => {});
}

/** Warm the media for a single feed post (native or mixed-in Nostr note). */
export function prefetchPostMedia(post: FeedPost): void {
  if (isNostrPost(post)) {
    // Nostr media is already direct https — warm the first image (posters/clips
    // aren't modeled, and we avoid pulling remote video bytes).
    const first = post.nostr?.images?.[0];
    if (first) warmImageUrl(first);
    return;
  }
  const d = decodeBody(post.body);
  if (d.kind === "photo") {
    prefetchImage(d.data.cid);
  } else if (d.kind === "carousel") {
    // Just the first slide — the rest warm when the viewer opens the carousel.
    const first = d.data.items[0];
    if (first) prefetchImage(first.cid);
  } else if (d.kind === "video") {
    prefetchVideo(d.data.cid, d.data.poster);
  }
}

/** Warm the media for a batch of posts (e.g. the next few below the fold). */
export function prefetchPosts(posts: FeedPost[]): void {
  for (const p of posts) prefetchPostMedia(p);
}
