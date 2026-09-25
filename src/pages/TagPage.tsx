import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Hash } from "lucide-react";
import { useGlobalTimeline } from "@/hooks/useSocial";
import { postHashtags } from "@/lib/discover";
import FeedList from "@/components/FeedList";

/**
 * Posts for a hashtag. No server-side tag index exists, so this filters the
 * recent global timeline client-side — it shows recent matches, not the full
 * history (that needs a node index).
 */
export default function TagPage() {
  const { tag = "" } = useParams<{ tag: string }>();
  const navigate = useNavigate();
  const t = decodeURIComponent(tag).toLowerCase();
  const { data, isLoading, isError } = useGlobalTimeline();

  const posts = (data ?? []).filter((p) => postHashtags(p).includes(t));

  return (
    <div>
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center gap-3 border-b border-ink-border bg-ink/80 px-4 py-3 backdrop-blur md:top-0">
        <button onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-soft">
            <Hash className="h-4 w-4 text-rouge-400" />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-base font-semibold">#{t}</h1>
            <p className="text-xs text-ink-muted">
              {isLoading ? "…" : `${posts.length} recent post${posts.length === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
      </header>

      <FeedList
        posts={posts}
        isLoading={isLoading}
        isError={isError}
        emptyState={
          <div className="px-6 py-16 text-center text-sm text-ink-muted">
            No recent posts tagged <span className="font-semibold text-white">#{t}</span>.
          </div>
        }
      />
    </div>
  );
}
