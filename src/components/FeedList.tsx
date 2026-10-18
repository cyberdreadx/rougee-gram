import { useTranslation } from "react-i18next";
import PostCard from "./PostCard";
import PostSkeleton from "./PostSkeleton";
import { isRenderablePost } from "@/hooks/useSocial";
import { useSponsoredPosts } from "@/hooks/usePromote";
import SponsoredPost from "./SponsoredPost";
import { decodeBody } from "@/lib/envelope";
import { isNostrPost, type FeedPost } from "@/lib/nostrFeed";
import { prefetchPosts } from "@/lib/prefetch";
import NostrPostCard from "./NostrPostCard";
import { useCallback, useEffect, useRef, type ReactNode } from "react";

interface Props {
  posts: FeedPost[] | undefined;
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
  const { t } = useTranslation();
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
        {t("feed.connError")}
      </div>
    );
  }

  const visible = (posts ?? []).filter((p) => {
    if (isNostrPost(p)) return true; // mixed-in Nostr notes bypass the envelope filters
    if (!isRenderablePost(p)) return false;
    const kind = decodeBody(p.body).kind;
    if (kind === "profile" || kind === "story" || kind === "note" || kind === "highlight")
      return false;
    if (photosOnly && kind !== "photo") return false;
    if (textOnly && kind !== "text") return false;
    return true;
  });

  if (visible.length === 0) {
    return <>{emptyState ?? <DefaultEmpty />}</>;
  }

  return <FeedBody visible={visible} showSponsored={showSponsored} />;
}

/** How many posts ahead of the one approaching the viewport to warm. */
const LOOKAHEAD = 3;

/** Renders the posts, optionally interspersing sponsored (boosted) posts. Split
 *  out so the sponsored hooks only run when a feed opts in (Home/Explore). */
function FeedBody({ visible, showSponsored }: { visible: FeedPost[]; showSponsored?: boolean }) {
  const { data: sponsored } = useSponsoredPosts();
  const shownIds = new Set(visible.map((p) => p.id));
  // Don't double-show a boosted post that's already organically in the feed.
  const ads = showSponsored ? (sponsored ?? []).filter((p) => !shownIds.has(p.id)) : [];

  // Warm the first few posts' media up front (what the viewer sees + a little
  // below the fold). A stable signature avoids re-warming on unrelated renders.
  const sig = visible.map((p) => p.id).join(",");
  useEffect(() => {
    prefetchPosts(visible.slice(0, LOOKAHEAD + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  // As a post nears the viewport, warm the next LOOKAHEAD posts' media so they're
  // ready by the time the viewer scrolls to / taps them. Read `visible` through a
  // ref so the callback stays stable — otherwise every feed re-render would tear
  // down and rebuild every row's IntersectionObserver.
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onApproach = useCallback(
    (index: number) =>
      prefetchPosts(visibleRef.current.slice(index + 1, index + 1 + LOOKAHEAD)),
    [],
  );

  const renderPost = (post: FeedPost, index: number) => {
    const card = isNostrPost(post) ? (
      <NostrPostCard post={post} />
    ) : (
      <PostCard post={post} />
    );
    return (
      <ApproachAnchor key={post.id} index={index} onApproach={onApproach}>
        {card}
      </ApproachAnchor>
    );
  };

  if (ads.length === 0) {
    return <div>{visible.map(renderPost)}</div>;
  }

  // Slot a sponsored post in after the 2nd post, then every 5.
  const out: React.ReactNode[] = [];
  let ad = 0;
  visible.forEach((post, i) => {
    out.push(renderPost(post, i));
    if (ad < ads.length && (i === 1 || (i > 1 && (i - 1) % 5 === 0))) {
      const a = ads[ad++];
      out.push(<SponsoredPost key={`ad-${a.id}`} post={a} />);
    }
  });
  return <div>{out}</div>;
}

/** Fires `onApproach(index)` once when its post is within ~800px of the viewport
 *  — the hook for prefetching the posts just below it. A plain block wrapper, so
 *  it doesn't alter card layout. */
function ApproachAnchor({
  index,
  onApproach,
  children,
}: {
  index: number;
  onApproach: (index: number) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          onApproach(index);
          io.disconnect(); // one-shot — only need to warm the next window once
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [index, onApproach]);
  return <div ref={ref}>{children}</div>;
}

function DefaultEmpty() {
  const { t } = useTranslation();
  return (
    <div className="px-4 py-16 text-center text-sm text-ink-muted">
      {t("feed.empty")}
    </div>
  );
}
