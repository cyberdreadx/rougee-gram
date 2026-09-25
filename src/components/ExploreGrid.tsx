import { Link } from "react-router-dom";
import { Play, Film, Copy } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { toMediaCells } from "./PhotoGrid";
import MediaImage from "./MediaImage";
import MediaVideo from "./MediaVideo";
import { cn } from "@/lib/utils";

/**
 * Explore grid: a uniform square photo grid. (An earlier "featured" 2-row mosaic
 * tile collapsed into an empty gap when there were few posts — the tall tile
 * borrowed its height from neighboring square tiles that didn't exist. A plain
 * square grid has no such edge case; bring the mosaic back behind a
 * content-count check if desired once there's reliably enough to fill it.)
 */
export default function ExploreGrid({
  posts,
  isLoading,
}: {
  posts?: SocialPost[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="skeleton aspect-square" />
        ))}
      </div>
    );
  }

  const cells = toMediaCells(posts);
  if (cells.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm text-ink-muted">
        Nothing to explore yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
      {cells.map(({ post, thumbRef, videoRef, isVideo, isReel, isCarousel }, i) => {
        return (
          <Link
            key={post.id}
            to={`/p/${post.id}`}
            style={{ animationDelay: `${Math.min(i, 11) * 28}ms` }}
            className={cn(
              "group relative aspect-square animate-fade-in-up overflow-hidden bg-ink-soft",
            )}
          >
            {isVideo && videoRef ? (
              // Loop a muted preview (plays only while on screen) so the tile
              // shows what the clip is, not a frozen frame.
              <MediaVideo
                refUri={videoRef}
                poster={thumbRef || undefined}
                autoPreview
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : thumbRef ? (
              <MediaImage
                refUri={thumbRef}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
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
          </Link>
        );
      })}
    </div>
  );
}
