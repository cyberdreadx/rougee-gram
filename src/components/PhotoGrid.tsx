import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Heart, Play, Film, Copy, Pin } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { decodeBody } from "@/lib/envelope";
import MediaImage from "./MediaImage";
import { cn } from "@/lib/utils";

interface Cell {
  post: SocialPost;
  /** Thumbnail media ref (photo cid or video poster); may be "" for a posterless video. */
  thumbRef: string;
  /** For video cells: the video media ref, so grids can loop a muted preview. */
  videoRef?: string;
  isVideo: boolean;
  isReel: boolean;
  isCarousel: boolean;
  /** Intrinsic media dimensions (if the envelope recorded them) — drives the
   *  masonry cell's aspect ratio so tall stays tall and wide stays wide. */
  w?: number;
  h?: number;
}

export function toMediaCells(posts: SocialPost[] | undefined): Cell[] {
  const cells: Cell[] = [];
  for (const post of posts ?? []) {
    if (post.reply_to_id) continue;
    const decoded = decodeBody(post.body);
    if (decoded.kind === "photo") {
      cells.push({
        post,
        thumbRef: decoded.data.cid,
        isVideo: false,
        isReel: false,
        isCarousel: false,
        w: decoded.data.w,
        h: decoded.data.h,
      });
    } else if (decoded.kind === "video") {
      // A 9:16 reel is framed tall even when the source clip isn't.
      const reel = decoded.data.t === "reel" || decoded.data.crop === "9:16";
      cells.push({
        post,
        thumbRef: decoded.data.poster ?? "",
        videoRef: decoded.data.cid,
        isVideo: true,
        isReel: decoded.data.t === "reel",
        isCarousel: false,
        w: reel ? 9 : decoded.data.w,
        h: reel ? 16 : decoded.data.h,
      });
    } else if (decoded.kind === "carousel") {
      const first = decoded.data.items[0];
      cells.push({
        post,
        thumbRef: first?.cid ?? "",
        isVideo: false,
        isReel: false,
        isCarousel: true,
        w: first?.w,
        h: first?.h,
      });
    }
  }
  return cells;
}

/** Aspect ratio (w/h) for a cell, clamped to a sane range so an extreme
 *  panorama or sliver can't collapse the column. Defaults to square when the
 *  envelope didn't record dimensions (older posts, posterless video). */
export function cellAspect(c: Cell): number {
  if (!c.w || !c.h) return 1;
  const ar = c.w / c.h;
  if (!Number.isFinite(ar) || ar <= 0) return 1;
  return Math.min(2.2, Math.max(0.5, ar));
}

/** @deprecated use toMediaCells */
export const toPhotoCells = toMediaCells;

export default function PhotoGrid({
  posts,
  isLoading,
  only,
  emptyLabel,
  pinnedIds,
}: {
  posts: SocialPost[] | undefined;
  isLoading?: boolean;
  /** Restrict the grid to a single media kind (e.g. the profile Reels tab). */
  only?: "reels";
  emptyLabel?: string;
  /** Post ids to badge with a pin marker (profile grid). */
  pinnedIds?: Set<string>;
}) {
  const { t } = useTranslation();
  // Masonry via CSS columns: cells keep their real aspect ratio and flow into
  // three columns of varying height (tall stays tall, wide stays wide), instead
  // of the uniform square crop. `break-inside-avoid` keeps a cell whole.
  if (isLoading) {
    // Varied skeleton heights so the loading state reads as masonry, not a grid.
    const ratios = [1, 1.4, 0.7, 1, 0.8, 1.3, 1, 0.9, 1.2];
    return (
      <div className="columns-3 gap-0.5 [column-fill:_balance] sm:gap-1">
        {ratios.map((r, i) => (
          <div
            key={i}
            className="skeleton mb-0.5 w-full break-inside-avoid sm:mb-1"
            style={{ aspectRatio: `${r} / 1` }}
          />
        ))}
      </div>
    );
  }

  let cells = toMediaCells(posts);
  if (only === "reels") cells = cells.filter((c) => c.isReel);
  if (cells.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm text-ink-muted">
        {emptyLabel ?? t("feed.empty")}
      </div>
    );
  }

  return (
    <div className="columns-3 gap-0.5 [column-fill:_balance] sm:gap-1">
      {cells.map((cell, i) => {
        const { post, thumbRef, isVideo, isReel, isCarousel } = cell;
        return (
          <Link
            key={post.id}
            to={`/p/${post.id}`}
            style={{
              animationDelay: `${Math.min(i, 11) * 28}ms`,
              aspectRatio: `${cellAspect(cell)}`,
            }}
            className="group relative mb-0.5 block w-full break-inside-avoid animate-fade-in-up overflow-hidden rounded-sm bg-ink-soft sm:mb-1"
          >
            {thumbRef ? (
              <MediaImage
                refUri={thumbRef}
                alt=""
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-ink-soft">
                <Film className="h-6 w-6 text-ink-muted" />
              </div>
            )}
            {(isVideo || isCarousel) && (
              <span className="pointer-events-none absolute right-1.5 top-1.5 text-white drop-shadow">
                {isCarousel ? (
                  <Copy className="h-4 w-4" />
                ) : isReel ? (
                  <Film className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4 fill-white" />
                )}
              </span>
            )}
            {pinnedIds?.has(post.id) && (
              <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded bg-black/55 px-1 py-0.5 text-[10px] font-semibold text-white backdrop-blur">
                <Pin className="h-3 w-3 fill-white" /> Pinned
              </span>
            )}
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity",
                "group-hover:bg-black/30 group-hover:opacity-100",
              )}
            >
              <Heart className="h-5 w-5 fill-white text-white" />
            </div>
          </Link>
        );
      })}
    </div>
  );
}
