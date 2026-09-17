import { useEffect, useRef, useState } from "react";
import { Heart, Pause, Volume2, VolumeX } from "lucide-react";
import { useTapGestures } from "@/hooks/useTapGestures";
import MediaVideo from "./MediaVideo";
import { cn } from "@/lib/utils";

/**
 * In-feed video player (Instagram-style): autoplays muted while on screen, loops,
 * and plays INLINE — never opens a separate/native fullscreen view. Gestures:
 * single tap = mute toggle, double tap = like, press-and-hold = pause / release
 * = resume.
 */
export default function FeedVideo({
  refUri,
  poster,
  cropped,
  clipStart,
  clipEnd,
  liked,
  onLike,
}: {
  refUri: string;
  poster?: string;
  cropped?: boolean;
  clipStart?: number;
  clipEnd?: number;
  liked: boolean;
  /** Called on a double-tap like (only when not already liked). */
  onLike: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [burst, setBurst] = useState(false);
  const [holding, setHolding] = useState(false);
  const [muteHint, setMuteHint] = useState(false);

  // Autoplay (muted) only while on screen; pause when scrolled away so several
  // feed videos never play or buffer at once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        const v = videoRef.current;
        if (!v) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
          v.play().catch(() => {});
        } else {
          v.pause();
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
        onLike();
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

  return (
    <div ref={containerRef} className="relative h-full w-full">
      <MediaVideo
        onRef={(el) => (videoRef.current = el)}
        refUri={refUri}
        poster={poster}
        className={cn("h-full w-full bg-black", cropped ? "object-cover" : "object-contain")}
        loop
        muted={muted}
        controls={false}
        playsInline
        clipStart={clipStart}
        clipEnd={clipEnd}
      />

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

      {/* mute toggle */}
      <button
        onClick={() => setMuted((m) => !m)}
        className="absolute bottom-2 right-2 z-10 rounded-full bg-black/50 p-2 text-white backdrop-blur"
        aria-label={muted ? "Unmute" : "Mute"}
      >
        {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
      </button>
    </div>
  );
}
