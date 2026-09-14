import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { decodeBody, type PhotoEnvelope } from "@/lib/envelope";
import MediaImage from "./MediaImage";

interface Cell {
  post: SocialPost;
  photo: PhotoEnvelope;
}

export function toPhotoCells(posts: SocialPost[] | undefined): Cell[] {
  const cells: Cell[] = [];
  for (const post of posts ?? []) {
    if (post.reply_to_id) continue;
    const decoded = decodeBody(post.body);
    if (decoded.kind === "photo") cells.push({ post, photo: decoded.data });
  }
  return cells;
}

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

  const cells = toPhotoCells(posts);
  if (cells.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm text-ink-muted">
        No photos yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
      {cells.map(({ post, photo }) => (
        <Link
          key={post.id}
          to={`/p/${post.id}`}
          className="group relative aspect-square overflow-hidden bg-ink-soft"
        >
          <MediaImage
            refUri={photo.cid}
            alt={photo.cap || "photo"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-opacity group-hover:bg-black/30 group-hover:opacity-100">
            <Heart className="h-5 w-5 fill-white text-white" />
          </div>
        </Link>
      ))}
    </div>
  );
}
