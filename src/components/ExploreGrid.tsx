import { Link } from "react-router-dom";
import { Play, Film, Copy } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { toMediaCells } from "./PhotoGrid";
import MediaImage from "./MediaImage";
import MediaVideo from "./MediaVideo";
import { cn } from "@/lib/utils";

/**
 * Instagram-style Explore grid: mostly square tiles with a periodic 2-row
 * "featured" tile, packed with dense auto-flow so the mosaic stays gap-free.
 * The tall tiles' heights come from the surrounding square tiles' tracks.
 */
function isFeatured(i: number): boolean {
  // One tall tile per 7 — its column drifts naturally, giving an organic mosaic.
  return i % 7 === 3;
}

export default function ExploreGrid({
  posts,
  isLoading,
}: {
  posts?: SocialPost[];
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-0.5 sm:gap-1" style={{ gridAutoFlow: "dense" }}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className={cn("skeleton", isFeatured(i) ? "row-span-2" : "aspect-square")}
          />
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
    <div className="grid grid-cols-3 gap-0.5 sm:gap-1" style={{ gridAutoFlow: "dense" }}>
      {cells.map(({ post, thumbRef, videoRef, isVideo, isReel, isCarousel }, i) => {
        const featured = isFeatured(i);
        return (
          <Link
            key={post.id}
            to={`/p/${post.id}`}
            className={cn(
              "group relative overflow-hidden bg-ink-soft",
              featured ? "row-span-2" : "aspect-square",
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
