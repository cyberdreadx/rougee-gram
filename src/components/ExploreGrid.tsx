import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Play, Film, Copy, Rocket } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { toMediaCells } from "./PhotoGrid";
import MediaImage from "./MediaImage";
import MediaVideo from "./MediaVideo";
import { useSponsoredPosts } from "@/hooks/usePromote";
import { recordImpression } from "@/lib/promote";
import { useAuth } from "@/store/auth";
import { useToast } from "./Toast";

type Cell = ReturnType<typeof toMediaCells>[number];

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
  showSponsored,
}: {
  posts?: SocialPost[];
  isLoading?: boolean;
  showSponsored?: boolean;
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

  return <Grid cells={cells} showSponsored={showSponsored} />;
}

function Grid({ cells, showSponsored }: { cells: Cell[]; showSponsored?: boolean }) {
  const { data: sponsored } = useSponsoredPosts();
  const have = new Set(cells.map((c) => c.post.id));
  const adCells = showSponsored
    ? toMediaCells(sponsored).filter((c) => !have.has(c.post.id))
    : [];

  // Intersperse a sponsored tile after every 5th tile.
  const items: { cell: Cell; sponsored: boolean }[] = [];
  let a = 0;
  cells.forEach((cell, i) => {
    items.push({ cell, sponsored: false });
    if (a < adCells.length && (i + 1) % 5 === 0) items.push({ cell: adCells[a++], sponsored: true });
  });

  return (
    <div className="grid grid-cols-3 gap-0.5 sm:gap-1">
      {items.map(({ cell, sponsored }, i) => (
        <GridTile key={sponsored ? `ad-${cell.post.id}-${i}` : cell.post.id} cell={cell} sponsored={sponsored} i={i} />
      ))}
    </div>
  );
}

function GridTile({ cell, sponsored, i }: { cell: Cell; sponsored: boolean; i: number }) {
  const { post, thumbRef, videoRef, isVideo, isReel, isCarousel } = cell;
  const { publicKey } = useAuth();
  const { toast } = useToast();
  const ref = useRef<HTMLAnchorElement | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    if (!sponsored) return;
    const el = ref.current;
    if (!el || !publicKey) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !fired.current) {
          fired.current = true;
          obs.disconnect();
          recordImpression(post.id, publicKey).then((r) => {
            if (r.earned > 0) toast(`+${r.earned} XRGE for viewing 🎉`, "success");
          });
        }
      },
      { threshold: 0.6 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [sponsored, post.id, publicKey, toast]);

  return (
    <Link
      ref={ref}
      to={`/p/${post.id}`}
      style={{ animationDelay: `${Math.min(i, 11) * 28}ms` }}
      className="group relative aspect-square animate-fade-in-up overflow-hidden bg-ink-soft"
    >
      {isVideo && videoRef ? (
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
      {sponsored && (
        <span className="pointer-events-none absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded bg-black/55 px-1 py-0.5 text-[9px] font-semibold uppercase text-white backdrop-blur">
          <Rocket className="h-2.5 w-2.5" /> Ad
        </span>
      )}
      {(isVideo || isCarousel) && (
        <span className="pointer-events-none absolute right-1.5 top-1.5 text-white drop-shadow">
          {isCarousel ? <Copy className="h-4 w-4" /> : isReel ? <Film className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white" />}
        </span>
      )}
    </Link>
  );
}
