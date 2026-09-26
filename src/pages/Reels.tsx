import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Heart, MessageCircle, Repeat2, Volume2, VolumeX, Pause, Film, Music2, Rocket } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import {
  useGlobalTimeline,
  usePostStats,
  useToggleLike,
  useToggleRepost,
} from "@/hooks/useSocial";
import { useProfile } from "@/hooks/useProfile";
import { useSponsoredPosts } from "@/hooks/usePromote";
import { recordImpression } from "@/lib/promote";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import { useTapGestures } from "@/hooks/useTapGestures";
import { useCreatePost } from "@/components/CreatePost";
import { decodeBody, type VideoEnvelope } from "@/lib/envelope";
import { formatCount } from "@/lib/format";
import Avatar from "@/components/Avatar";
import MediaVideo from "@/components/MediaVideo";
import UserLink from "@/components/UserLink";
import SaveButton from "@/components/SaveButton";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const isReel = (p: SocialPost): boolean => {
  if (p.reply_to_id) return false;
  const d = decodeBody(p.body);
  return d.kind === "video" && d.data.t === "reel";
};

export default function Reels() {
  const { data, isLoading } = useGlobalTimeline();
  const { data: sponsored } = useSponsoredPosts();
  const { open } = useCreatePost();

  const reels = (data ?? []).filter(isReel);
  // Sponsored reels (boosted reel posts not already organically present).
  const sponsoredReels = (sponsored ?? [])
    .filter(isReel)
    .filter((p) => !reels.some((r) => r.id === p.id));
  // Intersperse one sponsored reel after every 4th organic reel.
  const feed: { post: SocialPost; sponsored: boolean }[] = [];
  let s = 0;
  reels.forEach((post, i) => {
    feed.push({ post, sponsored: false });
    if (s < sponsoredReels.length && (i + 1) % 4 === 0) {
      feed.push({ post: sponsoredReels[s++], sponsored: true });
    }
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
        <button className="btn-primary" onClick={() => open()}>
          Create a reel
        </button>
      </div>
    );
  }

  return (
    <div className="hide-scrollbar h-[calc(100dvh-var(--top-bar-h)-var(--bottom-nav-h))] snap-y snap-mandatory overflow-y-auto md:h-[calc(100dvh-2rem)]">
      {feed.map(({ post, sponsored }, i) => (
        <ReelItem key={sponsored ? `ad-${post.id}-${i}` : post.id} post={post} sponsored={sponsored} />
      ))}
    </div>
  );
}

function ReelItem({ post, sponsored }: { post: SocialPost; sponsored?: boolean }) {
  const decoded = decodeBody(post.body);
  const { publicKey } = useAuth();
  const { toast } = useToast();
  const impFired = useRef(false);
  const reel = decoded.kind === "video" ? (decoded.data as VideoEnvelope) : null;
  const { data: profile } = useProfile(post.author_pubkey);
  const { data: stats } = usePostStats(post.id);
  const like = useToggleLike(post.id);
  const repost = useToggleRepost(post.id);
  const navigate = useNavigate();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [holding, setHolding] = useState(false);
  const [burst, setBurst] = useState(false);
  const [muteHint, setMuteHint] = useState(false);
  const liked = stats?.liked ?? false;

  // Attached qRougee sound (mixed over the muted video). See envelope SoundRef.
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const sound = reel?.audio?.url ? reel.audio : null;
  const soundStart = sound?.start ?? 0;

  function startSound() {
    const a = audioElRef.current;
    if (!a) return;
    if (a.currentTime < soundStart) a.currentTime = soundStart;
    a.play().catch(() => {});
  }
  function stopSound() {
    audioElRef.current?.pause();
  }

  // The mute toggle drives the track audio when a sound is attached.
  useEffect(() => {
    const a = audioElRef.current;
    if (a) a.muted = muted;
  }, [muted]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const vid = videoRef.current;
        if (!vid) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          vid.play().catch(() => {});
          startSound();
          // Sponsored reel scrolled into view → one-time view-to-earn.
          if (sponsored && !impFired.current && publicKey) {
            impFired.current = true;
            recordImpression(post.id, publicKey).then((r) => {
              if (r.earned > 0) toast(`+${r.earned} XRGE for viewing 🎉`, "success");
            });
          }
        } else {
          vid.pause();
          stopSound();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gestures (Instagram/X-style): single tap = mute, double tap = like,
  // press-and-hold = pause in place, release = resume.
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
      stopSound();
      setHolding(true);
    },
    onHoldEnd: () => {
      videoRef.current?.play().catch(() => {});
      startSound();
      setHolding(false);
    },
  });

  if (!reel) return null;

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full snap-start snap-always items-center justify-center bg-black"
    >
      {sponsored && (
        <span className="pointer-events-none absolute left-3 top-3 z-10 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur">
          <Rocket className="h-3 w-3" /> Sponsored
        </span>
      )}
      <MediaVideo
        onRef={(el) => (videoRef.current = el)}
        refUri={reel.cid}
        poster={reel.poster}
        className={cn(
          "h-full w-full",
          reel.crop === "9:16" ? "object-cover" : "object-contain",
        )}
        loop
        muted={sound ? true : muted}
        controls={false}
        playsInline
        clipStart={reel.start}
        clipEnd={reel.end}
      />

      {/* Attached track — mixed over the muted video, looped from its start. */}
      {sound && (
        <audio
          ref={audioElRef}
          src={sound.url}
          preload="auto"
          onEnded={() => {
            const a = audioElRef.current;
            if (a) {
              a.currentTime = soundStart;
              a.play().catch(() => {});
            }
          }}
        />
      )}

      {/* gesture layer — tap: mute · double-tap: like · hold: pause */}
      <div
        className="absolute inset-0 touch-pan-y select-none"
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

      {/* mute toggle */}
      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute right-3 top-3 z-10 rounded-full bg-black/50 p-2 text-white backdrop-blur"
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
        <button
          onClick={() => repost.mutate()}
          className="flex flex-col items-center gap-1"
          aria-label="Repost"
        >
          <Repeat2
            className={cn("h-8 w-8 drop-shadow", stats?.reposted && "text-emerald-400")}
          />
          <span className="text-xs font-semibold">{formatCount(stats?.reposts ?? 0)}</span>
        </button>
        <SaveButton postId={post.id} iconClassName="h-8 w-8 drop-shadow" />
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
        {sound && (
          <a
            href="https://music.rougee.app"
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex max-w-full items-center gap-1.5 text-xs text-white/90"
          >
            <Music2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {sound.title || "Original sound"}
              {sound.artist ? ` · ${sound.artist}` : ""}
            </span>
          </a>
        )}
      </div>
    </div>
  );
}
