import type { SocialPost } from "@rougechain/sdk";
import PostCard from "./PostCard";
import PostSkeleton from "./PostSkeleton";
import { isRenderablePost } from "@/hooks/useSocial";
import { useSponsoredPosts } from "@/hooks/usePromote";
import SponsoredPost from "./SponsoredPost";
import { decodeBody } from "@/lib/envelope";
import { type ReactNode } from "react";

interface Props {
  posts: SocialPost[] | undefined;
  isLoading: boolean;
  isError?: boolean;
  emptyState?: ReactNode;
  /** Only show photo posts (hides plain-text chain posts). */
  photosOnly?: boolean;
  /** Only show plain-text posts (hides media — used to surface text on Explore). */
  textOnly?: boolean;
  /** Intersperse sponsored (boosted) posts, labeled + view-to-earn. */
  showSponsored?: boolean;
}

export default function FeedList({
  posts,
  isLoading,
  isError,
  emptyState,
  photosOnly,
  textOnly,
  showSponsored,
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
    if (kind === "profile" || kind === "story" || kind === "note") return false;
    if (photosOnly && kind !== "photo") return false;
    if (textOnly && kind !== "text") return false;
    return true;
  });

  if (visible.length === 0) {
    return <>{emptyState ?? <DefaultEmpty />}</>;
  }

  return <FeedBody visible={visible} showSponsored={showSponsored} />;
}

/** Renders the posts, optionally interspersing sponsored (boosted) posts. Split
 *  out so the sponsored hooks only run when a feed opts in (Home/Explore). */
function FeedBody({ visible, showSponsored }: { visible: SocialPost[]; showSponsored?: boolean }) {
  const { data: sponsored } = useSponsoredPosts();
  const shownIds = new Set(visible.map((p) => p.id));
  // Don't double-show a boosted post that's already organically in the feed.
  const ads = showSponsored ? (sponsored ?? []).filter((p) => !shownIds.has(p.id)) : [];

  if (ads.length === 0) {
    return (
      <div>
        {visible.map((post) => (
          <PostCard key={post.id} post={post} />
        ))}
      </div>
    );
  }

  // Slot a sponsored post in after the 2nd post, then every 5.
  const out: React.ReactNode[] = [];
  let ad = 0;
  visible.forEach((post, i) => {
    out.push(<PostCard key={post.id} post={post} />);
    if (ad < ads.length && (i === 1 || (i > 1 && (i - 1) % 5 === 0))) {
      const a = ads[ad++];
      out.push(<SponsoredPost key={`ad-${a.id}`} post={a} />);
    }
  });
  return <div>{out}</div>;
}

function DefaultEmpty() {
  return (
    <div className="px-4 py-16 text-center text-sm text-ink-muted">
      Nothing here yet.
    </div>
  );
}
