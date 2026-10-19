import { useParams, useNavigate, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, Globe } from "lucide-react";
import { useNostrPost } from "@/hooks/useNostrFeed";
import NostrPostCard from "@/components/NostrPostCard";

/**
 * A single Nostr note, opened from an Activity notification ("… liked your
 * post"). The liked/reposted post lives on Nostr (a mirrored copy), so we fetch
 * the event by id from relays and render it with the normal NostrPostCard.
 */
export default function NostrPost() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { eventId } = useParams<{ eventId: string }>();
  const { post, loading, rougeeId } = useNostrPost(eventId);

  // If the note is a rougee mirror, deep-link to the native RougeChain post.
  if (rougeeId) return <Navigate to={`/p/${rougeeId}`} replace />;

  return (
    <div className="pb-[calc(var(--bottom-nav-h)+2rem)] md:pb-0">
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center gap-3 border-b border-ink-border bg-ink/55 px-3 py-3 backdrop-blur md:top-0">
        <button className="btn-ghost h-9 w-9 p-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex items-center gap-1.5 text-base font-semibold">
          <Globe className="h-4 w-4 text-ink-muted" /> {t("post.title")}
        </h1>
      </header>

      {loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        </div>
      )}

      {!loading && !post && (
        <div className="py-16 text-center text-sm text-ink-muted">{t("post.loadError")}</div>
      )}

      {post && (
        <div className="mx-auto max-w-xl">
          <NostrPostCard post={post} />
        </div>
      )}
    </div>
  );
}
