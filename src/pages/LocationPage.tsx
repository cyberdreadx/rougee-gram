import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin } from "lucide-react";
import { useGlobalTimeline } from "@/hooks/useSocial";
import { postLocation, locationMatches } from "@/lib/discover";
import FeedList from "@/components/FeedList";

/**
 * Posts from a location. Like tags, there's no server-side location index, so
 * this filters the recent global timeline client-side (recent matches only).
 */
export default function LocationPage() {
  const { loc = "" } = useParams<{ loc: string }>();
  const navigate = useNavigate();
  const place = decodeURIComponent(loc);
  const { data, isLoading, isError } = useGlobalTimeline();

  const posts = (data ?? []).filter((p) => locationMatches(postLocation(p), place));

  return (
    <div>
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center gap-3 border-b border-ink-border bg-ink/80 px-4 py-3 backdrop-blur md:top-0">
        <button onClick={() => navigate(-1)} aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-soft">
            <MapPin className="h-4 w-4 text-rouge-400" />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-base font-semibold">{place}</h1>
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
            No recent posts from <span className="font-semibold text-white">{place}</span>.
          </div>
        }
      />
    </div>
  );
}
