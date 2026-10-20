import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Music2, Plus, ExternalLink, Loader2 } from "lucide-react";
import { useSoundTrack, useSoundReels, useTrackArtist } from "@/hooks/useSounds";
import { usePost } from "@/hooks/useSocial";
import { useCreatePost } from "@/components/CreatePost";
import { decodeBody } from "@/lib/envelope";
import { soundsEnabled } from "@/lib/sounds";
import MediaImage from "@/components/MediaImage";
import TrackTip from "@/components/TrackTip";

/**
 * A track's page: who made it, how to use it, and the reels that already do.
 * Works even while the sounds Worker is dormant — the reels grid is simply
 * omitted (the track header + "use this sound" come straight from the NFT).
 */
export default function SoundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { data: track, isLoading } = useSoundTrack(id);
  const { data: artist } = useTrackArtist(id);
  const { data: summary } = useSoundReels(id);
  const { open: openComposer } = useCreatePost();

  const title = track?.title || summary?.title || t("sound.untitled");
  const artistName = track?.artist || summary?.artist || "";
  const count = summary?.count ?? 0;
  const reels = summary?.reels ?? [];

  const useThisSound = () => {
    if (track) openComposer("reel", { sound: track });
  };

  return (
    <div className="pb-[calc(var(--bottom-nav-h)+2rem)] md:pb-0">
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center gap-3 border-b border-ink-border bg-ink/55 px-3 py-3 backdrop-blur md:top-0">
        <button className="btn-ghost h-9 w-9 p-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="truncate text-base font-semibold">{t("sound.title")}</h1>
      </header>

      {/* Track header */}
      <div className="flex items-center gap-3 p-4">
        {track?.coverUrl ? (
          <img src={track.coverUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-ink-soft">
            <Music2 className="h-7 w-7 text-ink-muted" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold">{title}</h2>
          {artistName && <p className="truncate text-sm text-ink-muted">{artistName}</p>}
          {soundsEnabled() && (
            <p className="text-xs text-ink-muted">{t("sound.reelCount", { count })}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 px-4">
        <button
          className="btn-primary gap-1.5 py-2.5"
          onClick={useThisSound}
          disabled={!track}
        >
          <Plus className="h-4 w-4" /> {t("reelPreview.useSound")}
        </button>
        <TrackTip trackId={id} artistName={artistName || title} />
        {artist?.trackUrl && (
          <a
            href={artist.trackUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-soft gap-1.5 py-2.5"
          >
            <ExternalLink className="h-4 w-4" /> qRougee
          </a>
        )}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        </div>
      )}

      {/* Reels using this sound */}
      {soundsEnabled() && reels.length > 0 && (
        <>
          <h3 className="px-4 pb-2 pt-6 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("sound.reelsUsing")}
          </h3>
          <div className="grid grid-cols-3 gap-1 px-1 sm:gap-2 sm:px-2">
            {reels.map((r) => (
              <ReelTile key={r.postId} postId={r.postId} />
            ))}
          </div>
        </>
      )}

      {soundsEnabled() && !isLoading && reels.length === 0 && (
        <p className="px-4 py-12 text-center text-sm text-ink-muted">{t("sound.noReels")}</p>
      )}
    </div>
  );
}

function ReelTile({ postId }: { postId: string }) {
  const { data } = usePost(postId);
  const poster = (() => {
    if (!data?.post) return undefined;
    const d = decodeBody(data.post.body);
    return d.kind === "video" ? d.data.poster || d.data.cid : undefined;
  })();
  return (
    <Link to={`/p/${postId}`} className="block aspect-[9/16] overflow-hidden rounded-lg bg-ink-soft">
      {poster && <MediaImage refUri={poster} alt="" className="h-full w-full object-cover" />}
    </Link>
  );
}
