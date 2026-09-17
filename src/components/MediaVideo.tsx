import { useEffect, useRef, useState } from "react";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

interface Props {
  refUri: string;
  poster?: string;
  className?: string;
  /** Reels loop and start muted. */
  loop?: boolean;
  muted?: boolean;
  controls?: boolean;
  autoPlay?: boolean;
  playsInline?: boolean;
  /** Non-destructive trim: play only [clipStart, clipEnd] seconds. */
  clipStart?: number;
  clipEnd?: number;
  /** Feed preview: muted, looping, no controls, auto-plays only while on screen
   *  (like Instagram's in-feed video). Forces muted/loop/playsInline. */
  autoPreview?: boolean;
  onRef?: (el: HTMLVideoElement | null) => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

/** Resolves a video media reference (ipfs://… / local://… / https://) plus an
 *  optional poster and renders an HTML5 <video>, honoring an optional trim range. */
export default function MediaVideo({
  refUri,
  poster,
  className,
  loop,
  muted,
  controls = true,
  autoPlay,
  playsInline = true,
  clipStart,
  clipEnd,
  autoPreview,
  onRef,
  onEnded,
  onTimeUpdate,
}: Props) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const elRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let active = true;
    resolveMediaUrl(refUri).then((u) => active && setVideoUrl(u));
    if (poster) resolveMediaUrl(poster).then((u) => active && setPosterUrl(u));
    else setPosterUrl(null);
    return () => {
      active = false;
    };
  }, [refUri, poster]);

  const isHls = !!videoUrl && /\.m3u8($|\?)/i.test(videoUrl);

  // HLS playback (Cloudflare Stream etc.): native on Safari, else hls.js.
  useEffect(() => {
    const el = elRef.current;
    if (!el || !videoUrl || !isHls) return;
    if (el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = videoUrl;
      return;
    }
    let cancelled = false;
    let hls: { destroy: () => void } | null = null;
    import("hls.js")
      .then(({ default: Hls }) => {
        if (cancelled || !elRef.current) return;
        if (Hls.isSupported()) {
          const inst = new Hls({ enableWorker: true });
          inst.loadSource(videoUrl);
          inst.attachMedia(elRef.current);
          hls = inst;
        } else {
          elRef.current.src = videoUrl;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (hls) hls.destroy();
    };
  }, [videoUrl, isHls]);

  // React does not reliably sync the <video> `muted` DOM *property* when the
  // prop changes (facebook/react#10389), so an unmute tap flips state but the
  // element stays muted. Apply it imperatively so the mute toggle actually works.
  useEffect(() => {
    const el = elRef.current;
    if (el) el.muted = autoPreview ? true : !!muted;
  }, [muted, autoPreview, videoUrl]);

  // Feed preview: play a muted loop only while the video is on screen, and pause
  // it when scrolled away, so several feed videos never play (or buffer) at once.
  useEffect(() => {
    if (!autoPreview) return;
    const el = elRef.current;
    if (!el || !videoUrl) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: [0, 0.5, 1] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoPreview, videoUrl]);

  // Seek to the trim start once metadata is available.
  useEffect(() => {
    const el = elRef.current;
    if (!el || clipStart == null) return;
    const onMeta = () => {
      try {
        el.currentTime = clipStart;
      } catch {
        /* ignore */
      }
    };
    el.addEventListener("loadedmetadata", onMeta);
    if (el.readyState >= 1) onMeta();
    return () => el.removeEventListener("loadedmetadata", onMeta);
  }, [clipStart, videoUrl]);

  const setRef = (el: HTMLVideoElement | null) => {
    elRef.current = el;
    if (el) {
      // iOS: force inline playback so the OS never hijacks into its native
      // fullscreen player (Instagram/reels-style). React's `playsInline` prop is
      // not reliably honored in standalone PWAs / older iOS, so also set the raw
      // `playsinline` + legacy `webkit-playsinline` attributes and the property.
      el.setAttribute("playsinline", "");
      el.setAttribute("webkit-playsinline", "true");
      el.playsInline = true;
    }
    onRef?.(el);
  };

  return (
    <video
      ref={setRef}
      src={videoUrl && !isHls ? videoUrl : undefined}
      poster={posterUrl ?? undefined}
      className={cn(className)}
      loop={autoPreview ? true : loop}
      muted={autoPreview ? true : muted}
      controls={autoPreview ? false : controls}
      autoPlay={autoPreview ? false : autoPlay}
      playsInline={autoPreview ? true : playsInline}
      preload="metadata"
      onEnded={onEnded}
      onTimeUpdate={(e) => {
        const el = e.currentTarget;
        // Enforce the trim range (loop back to start at the trim end).
        if (clipEnd != null && el.currentTime >= clipEnd) {
          try {
            el.currentTime = clipStart ?? 0;
          } catch {
            /* ignore */
          }
        }
        onTimeUpdate?.(el.currentTime, el.duration);
      }}
    />
  );
}
