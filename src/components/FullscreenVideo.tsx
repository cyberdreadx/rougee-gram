import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X, Heart, MessageCircle, Repeat2, Volume2, VolumeX, Pause } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { decodeBody, type VideoEnvelope } from "@/lib/envelope";
import { usePostStats, useToggleLike, useToggleRepost } from "@/hooks/useSocial";
import { useProfile } from "@/hooks/useProfile";
import { useTapGestures } from "@/hooks/useTapGestures";
import { formatCount } from "@/lib/format";
import Avatar from "./Avatar";
import UserLink from "./UserLink";
import MediaVideo from "./MediaVideo";
import { cn } from "@/lib/utils";

/**
 * Full-screen video player opened from a feed/detail video tap ("born
 * fullscreen"). Same gesture model as reels: single tap = mute, double tap =
 * like, press-and-hold = pause in place / release = resume. Portals to
 * document.body so the composer/modal's blur/transform can't clip it.
 */
export default function FullscreenVideo({
  post,
  onClose,
}: {
  post: SocialPost;
  onClose: () => void;
}) {
  const decoded = decodeBody(post.body);
  const video = decoded.kind === "video" ? (decoded.data as VideoEnvelope) : null;

  const { data: profile } = useProfile(post.author_pubkey);
  const { data: stats } = usePostStats(post.id);
  const like = useToggleLike(post.id);
  const repost = useToggleRepost(post.id);
  const navigate = useNavigate();

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(false);
  const [holding, setHolding] = useState(false);
  const [burst, setBurst] = useState(false);
  const [muteHint, setMuteHint] = useState(false);
  const liked = stats?.liked ?? false;

  // Autoplay with sound (we arrive here from a user tap); if the browser blocks
  // unmuted autoplay, fall back to muted so playback still starts.
  const tryPlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => {
      if (!v.muted) {
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.addEventListener("canplay", tryPlay);
    if (v.readyState >= 3) tryPlay();
    return () => v.removeEventListener("canplay", tryPlay);
  }, [tryPlay]);

  // Lock body scroll + Escape to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const gestures = useTapGestures({
    onSingleTap: () => {
      setMuted((m) => !m);
      setMuteHint(true);
      window.setTimeout(() => setMuteHint(false), 650);
    },
    onDoubleTap: () => {
      if (!liked) {
        setBurst(true);
        window.setTimeout(() => setBurst(false), 700);
        like.mutate();
      }
    },
    onHoldStart: () => {
      videoRef.current?.pause();
      setHolding(true);
    },
    onHoldEnd: () => {
      videoRef.current?.play().catch(() => {});
      setHolding(false);
    },
  });

  if (!video) return null;

  const cropped = video.crop === "9:16";

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black">
      <MediaVideo
        onRef={(el) => (videoRef.current = el)}
        refUri={video.cid}
        poster={video.poster}
        className={cn("h-full w-full", cropped ? "object-cover" : "object-contain")}
        loop
        muted={muted}
        controls={false}
        playsInline
        clipStart={video.start}
        clipEnd={video.end}
      />

      {/* gesture layer — tap: mute · double-tap: like · hold: pause */}
      <div
        className="absolute inset-0 select-none"
        style={{ WebkitTouchCallout: "none" }}
        {...gestures}
      >
        {burst && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Heart className="h-24 w-24 animate-pop fill-white text-white drop-shadow-lg" />
          </span>
        )}
        {holding && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Pause className="h-14 w-14 fill-white/80 text-white/80 drop-shadow-lg" />
          </span>
        )}
        {muteHint && !holding && !burst && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="animate-pop rounded-full bg-black/50 p-4 backdrop-blur">
              {muted ? (
                <VolumeX className="h-8 w-8 text-white" />
              ) : (
                <Volume2 className="h-8 w-8 text-white" />
              )}
            </span>
          </span>
        )}
      </div>

      {/* close */}
      <button
        onClick={onClose}
        className="absolute left-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white backdrop-blur"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
        aria-label="Close"
      >
        <X className="h-5 w-5" />
      </button>

      {/* mute toggle */}
      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white backdrop-blur"
        style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>

      {/* action rail */}
      <div className="absolute bottom-24 right-3 z-10 flex flex-col items-center gap-5 text-white">
        <button
          onClick={() => like.mutate()}
          className="flex flex-col items-center gap-1"
          aria-label="Like"
        >
          <Heart className={cn("h-8 w-8 drop-shadow", liked && "fill-rouge-500 text-rouge-500")} />
          <span className="text-xs font-semibold">{formatCount(stats?.likes ?? 0)}</span>
        </button>
        <button
          onClick={() => {
            onClose();
            navigate(`/p/${post.id}`);
          }}
          className="flex flex-col items-center gap-1"
          aria-label="Comments"
        >
          <MessageCircle className="h-8 w-8 drop-shadow" />
          <span className="text-xs font-semibold">{formatCount(stats?.replies ?? 0)}</span>
        </button>
        <button
          onClick={() => repost.mutate()}
          className="flex flex-col items-center gap-1"
          aria-label="Repost"
        >
          <Repeat2 className={cn("h-8 w-8 drop-shadow", stats?.reposted && "text-emerald-400")} />
          <span className="text-xs font-semibold">{formatCount(stats?.reposts ?? 0)}</span>
        </button>
      </div>

      {/* author + caption */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent p-4 pb-6 pr-16 text-white">
        <div className="pointer-events-auto flex items-center gap-2">
          <Avatar refUri={profile?.avatarRef} seed={post.author_pubkey} name={profile?.name} size={34} />
          <UserLink pubkey={post.author_pubkey} className="text-sm font-semibold" />
        </div>
        {video.cap && <p className="mt-2 line-clamp-3 text-sm text-white/90">{video.cap}</p>}
      </div>
    </div>,
    document.body,
  );
}
