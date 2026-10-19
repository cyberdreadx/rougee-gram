import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Heart, Pause, Volume2, VolumeX, Music2 } from "lucide-react";
import { useTapGestures } from "@/hooks/useTapGestures";
import { useFeedMuted } from "@/lib/mute";
import type { SoundRef } from "@/lib/envelope";
import MediaVideo from "./MediaVideo";
import { cn } from "@/lib/utils";

/**
 * In-feed video player (Instagram-style): autoplays muted while on screen, loops,
 * and plays INLINE — never opens a separate/native fullscreen view. Gestures:
 * single tap = mute toggle, double tap = like, press-and-hold = pause / release
 * = resume. When the video carries an attached `sound` (a reel's track), it's
 * mixed over the muted video and attributed — same as the reels feed.
 */
export default function FeedVideo({
  refUri,
  poster,
  cropped,
  clipStart,
  clipEnd,
  liked,
  onLike,
  onLoadedMeta,
  sound,
}: {
  refUri: string;
  poster?: string;
  cropped?: boolean;
  clipStart?: number;
  clipEnd?: number;
  liked: boolean;
  /** Called on a double-tap like (only when not already liked). */
  onLike: () => void;
  /** Intrinsic video size once known (to size an unknown-ratio container). */
  onLoadedMeta?: (w: number, h: number) => void;
  /** Attached music track (qRougee) mixed over the muted video. */
  sound?: SoundRef;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const { t } = useTranslation();
  const [muted, setMuted] = useFeedMuted();
  const [burst, setBurst] = useState(false);
  const [holding, setHolding] = useState(false);
  const [muteHint, setMuteHint] = useState(false);

  const hasSound = !!sound?.url;
  const soundStart = sound?.start ?? 0;

  // Autoplay (muted) only while on screen; pause when scrolled away so several
  // feed videos never play or buffer at once. The VIDEO is controlled here; the
  // attached track follows the video's real playback (effect below).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const v = videoRef.current;
        if (!v) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // The mute toggle drives the TRACK's audio when a sound is attached (the video
  // itself stays muted so you never hear both).
  useEffect(() => {
    const a = audioElRef.current;
    if (a) a.muted = muted;
  }, [muted]);

  // Lock the attached track to the VIDEO's real playback so they never drift: the
  // track STARTS only when the video actually starts (not while it's still
  // buffering — the cause of "music plays first"), PAUSES whenever the video
  // pauses/stalls/buffers, re-aligns to the video's position on each resume, and
  // re-cues to its start offset when the looping video wraps.
  useEffect(() => {
    const v = videoRef.current;
    const a = audioElRef.current;
    if (!v || !a || !hasSound) return;
    const base = clipStart ?? 0;
    const align = () => {
      const target = soundStart + Math.max(0, v.currentTime - base);
      if (Math.abs(a.currentTime - target) > 0.3) {
        try {
          a.currentTime = target;
        } catch {
          /* seek not ready */
        }
      }
    };
    const onPlaying = () => {
      align();
      a.play().catch(() => {});
    };
    const onStop = () => a.pause();
    let last = 0;
    const onTime = () => {
      if (v.currentTime < last - 0.3) {
        // looped back to the start → re-cue the track to its offset
        try {
          a.currentTime = soundStart;
        } catch {
          /* ignore */
        }
        a.play().catch(() => {});
      }
      last = v.currentTime;
    };
    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onStop);
    v.addEventListener("waiting", onStop);
    v.addEventListener("stalled", onStop);
    v.addEventListener("timeupdate", onTime);
    if (!v.paused && v.readyState >= 3) onPlaying(); // already rolling
    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onStop);
      v.removeEventListener("waiting", onStop);
      v.removeEventListener("stalled", onStop);
      v.removeEventListener("timeupdate", onTime);
      a.pause();
    };
  }, [hasSound, soundStart, clipStart]);

  const gestures = useTapGestures({
    onSingleTap: () => {
      setMuted(!muted);
      setMuteHint(true);
      window.setTimeout(() => setMuteHint(false), 650);
    },
    onDoubleTap: () => {
      if (!liked) {
        setBurst(true);
        window.setTimeout(() => setBurst(false), 700);
        onLike();
      }
    },
    onHoldStart: () => {
      videoRef.current?.pause(); // the track follows via the video's pause event
      setHolding(true);
    },
    onHoldEnd: () => {
      videoRef.current?.play().catch(() => {}); // 'playing' re-aligns + resumes the track
      setHolding(false);
    },
  });

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <MediaVideo
        onRef={(el) => (videoRef.current = el)}
        refUri={refUri}
        poster={poster}
        className={cn("h-full w-full bg-black", cropped ? "object-cover" : "object-contain")}
        loop
        // With a track attached, keep the video silent — only the music plays.
        muted={hasSound ? true : muted}
        controls={false}
        playsInline
        clipStart={clipStart}
        clipEnd={clipEnd}
        onLoadedMeta={onLoadedMeta}
      />

      {hasSound && (
        <audio ref={audioElRef} src={sound!.url} loop preload="auto" muted={muted} />
      )}

      {/* gesture layer — tap: mute · double-tap: like · hold: pause.
          `touch-pan-y` keeps the feed scrollable through the video. */}
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

      {/* attached-track attribution (matches the reels feed) */}
      {hasSound && (
        <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex max-w-[70%] items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs text-white backdrop-blur">
          <Music2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {sound!.title || "Original sound"}
            {sound!.artist ? ` · ${sound!.artist}` : ""}
          </span>
        </div>
      )}

      {/* mute toggle */}
      <button
        onClick={() => setMuted(!muted)}
        className="absolute bottom-2 right-2 z-10 rounded-full bg-black/50 p-2 text-white backdrop-blur"
        aria-label={muted ? t("common.unmute") : t("common.mute")}
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
