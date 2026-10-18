import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Hash } from "lucide-react";
import { useHashtagFeed } from "@/hooks/useNostrFeed";
import FeedList from "@/components/FeedList";

/**
 * Posts for a hashtag across both networks — live Nostr notes (queried from
 * relays by the tag) merged with recent RougeChain posts carrying it. No
 * server-side tag index exists, so the rouge side is limited to the recent
 * timeline; the Nostr side queries relays directly.
 */
export default function TagPage() {
  const { t } = useTranslation();
  const { tag = "" } = useParams<{ tag: string }>();
  const navigate = useNavigate();
  const slug = decodeURIComponent(tag).toLowerCase();
  const { posts, loading } = useHashtagFeed(slug);
  const isLoading = loading;

  return (
    <div>
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center gap-3 border-b border-ink-border bg-ink/55 px-4 py-3 backdrop-blur md:top-0">
        <button onClick={() => navigate(-1)} aria-label={t("common.back")}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-soft">
            <Hash className="h-4 w-4 text-rouge-400" />
          </span>
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-base font-semibold">#{slug}</h1>
            <p className="text-xs text-ink-muted">
              {isLoading ? "…" : t("tag.recentPosts", { count: posts.length })}
            </p>
          </div>
        </div>
      </header>

      <FeedList
        posts={posts}
        isLoading={isLoading}
        emptyState={
          <div className="px-6 py-16 text-center text-sm text-ink-muted">
            {t("tag.noPosts", { tag: slug })}
          </div>
        }
      />
    </div>
  );
}
