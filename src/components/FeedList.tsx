import type { SocialPost } from "@rougechain/sdk";
import PostCard from "./PostCard";
import PostSkeleton from "./PostSkeleton";
import { isRenderablePost } from "@/hooks/useSocial";
import { decodeBody } from "@/lib/envelope";
import { type ReactNode } from "react";

interface Props {
  posts: SocialPost[] | undefined;
  isLoading: boolean;
  isError?: boolean;
  emptyState?: ReactNode;
  /** Only show photo posts (hides plain-text chain posts). */
  photosOnly?: boolean;
}

export default function FeedList({
  posts,
  isLoading,
  isError,
  emptyState,
  photosOnly,
}: Props) {
  if (isLoading) {
    return (
      <div>
        {[0, 1, 2].map((i) => (
          <PostSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="px-4 py-16 text-center text-sm text-ink-muted">
        Couldn't reach RougeChain. Check your connection and try again.
      </div>
    );
  }

  const visible = (posts ?? []).filter((p) => {
    if (!isRenderablePost(p)) return false;
    const kind = decodeBody(p.body).kind;
    if (kind === "profile" || kind === "story") return false;
    if (photosOnly && kind !== "photo") return false;
    return true;
  });

  if (visible.length === 0) {
    return <>{emptyState ?? <DefaultEmpty />}</>;
  }

  return (
    <div>
      {visible.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

function DefaultEmpty() {
  return (
    <div className="px-4 py-16 text-center text-sm text-ink-muted">
      Nothing here yet.
    </div>
  );
}
