import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle, Volume2, VolumeX, Play, Film } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { useGlobalTimeline, usePostStats, useToggleLike } from "@/hooks/useSocial";
import { useProfile } from "@/hooks/useProfile";
import { useCreatePost } from "@/components/CreatePost";
import { decodeBody, type VideoEnvelope } from "@/lib/envelope";
import { formatCount } from "@/lib/format";
import Avatar from "@/components/Avatar";
import MediaVideo from "@/components/MediaVideo";
import UserLink from "@/components/UserLink";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Reels() {
  const { data, isLoading } = useGlobalTimeline();
  const { open } = useCreatePost();

  const reels = (data ?? []).filter((p) => {
    if (p.reply_to_id) return false;
    const d = decodeBody(p.body);
    return d.kind === "video" && d.data.t === "reel";
  });

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (reels.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rouge-600/15 text-rouge-400">
          <Film className="h-8 w-8" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">No reels yet</h3>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
            Post a vertical video and toggle “Reel” to start the feed.
          </p>
        </div>
        <button className="btn-primary" onClick={open}>
          Create a reel
        </button>
      </div>
    );
  }

  return (
    <div className="hide-scrollbar h-[calc(100dvh-var(--top-bar-h)-var(--bottom-nav-h))] snap-y snap-mandatory overflow-y-auto md:h-[calc(100dvh-2rem)]">
      {reels.map((post) => (
        <ReelItem key={post.id} post={post} />
      ))}
    </div>
  );
}

function ReelItem({ post }: { post: SocialPost }) {
  const decoded = decodeBody(post.body);
  const reel = decoded.kind === "video" ? (decoded.data as VideoEnvelope) : null;
  const { data: profile } = useProfile(post.author_pubkey);
  const { data: stats } = usePostStats(post.id);
  const like = useToggleLike(post.id);
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const vid = videoRef.current;
        if (!vid) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          vid.play().then(() => setPlaying(true)).catch(() => {});
        } else {
          vid.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function togglePlay() {
    const vid = videoRef.current;
    if (!vid) return;
    if (vid.paused) {
      vid.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      vid.pause();
      setPlaying(false);
    }
  }

  const liked = stats?.liked ?? false;

  if (!reel) return null;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full snap-start snap-always items-center justify-center bg-black"
    >
      <MediaVideo
        onRef={(el) => (videoRef.current = el)}
        refUri={reel.cid}
        poster={reel.poster}
        className="h-full w-full object-contain"
        loop
        muted={muted}
        controls={false}
        playsInline
      />

      {/* tap layer */}
      <button className="absolute inset-0" onClick={togglePlay} aria-label="Play/pause">
        {!playing && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Play className="h-16 w-16 fill-white/90 text-white/90 drop-shadow-lg" />
          </span>
        )}
      </button>

      {/* mute toggle */}
      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white backdrop-blur"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>

      {/* action rail */}
      <div className="absolute bottom-24 right-3 flex flex-col items-center gap-5 text-white">
        <button
          onClick={() => like.mutate()}
          className="flex flex-col items-center gap-1"
          aria-label="Like"
        >
          <Heart className={cn("h-8 w-8 drop-shadow", liked && "fill-rouge-500 text-rouge-500")} />
          <span className="text-xs font-semibold">{formatCount(stats?.likes ?? 0)}</span>
        </button>
        <button
          onClick={() => navigate(`/p/${post.id}`)}
          className="flex flex-col items-center gap-1"
          aria-label="Comments"
        >
          <MessageCircle className="h-8 w-8 drop-shadow" />
          <span className="text-xs font-semibold">{formatCount(stats?.replies ?? 0)}</span>
        </button>
      </div>

      {/* author + caption */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pb-6 pr-16 text-white">
        <div className="flex items-center gap-2">
          <Avatar refUri={profile?.avatarRef} seed={post.author_pubkey} name={profile?.name} size={34} />
          <UserLink pubkey={post.author_pubkey} className="text-sm font-semibold" />
        </div>
        {reel.cap && (
          <p className="mt-2 line-clamp-2 text-sm text-white/90">{reel.cap}</p>
        )}
      </div>
    </div>
  );
}
