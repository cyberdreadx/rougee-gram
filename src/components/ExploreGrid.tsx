import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Play, Film, Copy, Rocket } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { toMediaCells, cellAspect } from "./PhotoGrid";
import MediaImage from "./MediaImage";
import MediaVideo from "./MediaVideo";
import { useSponsoredPosts } from "@/hooks/usePromote";
import { recordImpression } from "@/lib/promote";
import { useAuth } from "@/store/auth";
import { useToast } from "./Toast";

type Cell = ReturnType<typeof toMediaCells>[number];

/**
 * Explore grid: a masonry photo grid (CSS columns) that keeps each post's real
 * aspect ratio — tall stays tall, wide stays wide — matching the profile grid.
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
  const { t } = useTranslation();
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

  const cells = toMediaCells(posts);
  if (cells.length === 0) {
    return (
      <div className="px-4 py-16 text-center text-sm text-ink-muted">
        {t("explore.empty")}
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
    <div className="columns-3 gap-0.5 [column-fill:_balance] sm:gap-1">
      {items.map(({ cell, sponsored }, i) => (
        <GridTile key={sponsored ? `ad-${cell.post.id}-${i}` : cell.post.id} cell={cell} sponsored={sponsored} i={i} />
      ))}
    </div>
  );
}

function GridTile({ cell, sponsored, i }: { cell: Cell; sponsored: boolean; i: number }) {
  const { t } = useTranslation();
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
      style={{ animationDelay: `${Math.min(i, 11) * 28}ms`, aspectRatio: `${cellAspect(cell)}` }}
      className="group relative mb-0.5 block w-full break-inside-avoid animate-fade-in-up overflow-hidden rounded-sm bg-ink-soft sm:mb-1"
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
          <Rocket className="h-2.5 w-2.5" /> {t("ads.ad")}
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
