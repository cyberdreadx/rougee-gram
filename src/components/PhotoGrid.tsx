import { Link } from "react-router-dom";
import { Heart, Play, Film, Copy } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { decodeBody } from "@/lib/envelope";
import MediaImage from "./MediaImage";
import { cn } from "@/lib/utils";

interface Cell {
  post: SocialPost;
  /** Thumbnail media ref (photo cid or video poster); may be "" for a posterless video. */
  thumbRef: string;
  isVideo: boolean;
  isReel: boolean;
  isCarousel: boolean;
}

export function toMediaCells(posts: SocialPost[] | undefined): Cell[] {
  const cells: Cell[] = [];
  for (const post of posts ?? []) {
    if (post.reply_to_id) continue;
    const decoded = decodeBody(post.body);
    if (decoded.kind === "photo") {
      cells.push({ post, thumbRef: decoded.data.cid, isVideo: false, isReel: false, isCarousel: false });
    } else if (decoded.kind === "video") {
      cells.push({
        post,
        thumbRef: decoded.data.poster ?? "",
        isVideo: true,
        isReel: decoded.data.t === "reel",
        isCarousel: false,
      });
    } else if (decoded.kind === "carousel") {
      cells.push({
        post,
        thumbRef: decoded.data.items[0]?.cid ?? "",
        isVideo: false,
        isReel: false,
        isCarousel: true,
      });
    }
  }
  return cells;
}

/** @deprecated use toMediaCells */
export const toPhotoCells = toMediaCells;

export default function PhotoGrid({
  posts,
  isLoading,
}: {
  posts: SocialPost[] | undefined;
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
        Nothing here yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
      {cells.map(({ post, thumbRef, isVideo, isReel, isCarousel }) => (
        <Link
          key={post.id}
          to={`/p/${post.id}`}
          className="group relative aspect-square overflow-hidden bg-ink-soft"
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
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity",
              "group-hover:bg-black/30 group-hover:opacity-100",
            )}
          >
            <Heart className="h-5 w-5 fill-white text-white" />
          </div>
        </Link>
      ))}
    </div>
  );
}
