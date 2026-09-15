import { useEffect, useState } from "react";
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
  onRef?: (el: HTMLVideoElement | null) => void;
  onEnded?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
}

/** Resolves a video media reference (ipfs://… / local://…) plus optional poster
 *  and renders an HTML5 <video>. */
export default function MediaVideo({
  refUri,
  poster,
  className,
  loop,
  muted,
  controls = true,
  autoPlay,
  playsInline = true,
  onRef,
  onEnded,
  onTimeUpdate,
}: Props) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    resolveMediaUrl(refUri).then((u) => active && setVideoUrl(u));
    if (poster) resolveMediaUrl(poster).then((u) => active && setPosterUrl(u));
    else setPosterUrl(null);
    return () => {
      active = false;
    };
  }, [refUri, poster]);

  return (
    <video
      ref={onRef}
      src={videoUrl ?? undefined}
      poster={posterUrl ?? undefined}
      className={cn(className)}
      loop={loop}
      muted={muted}
      controls={controls}
      autoPlay={autoPlay}
      playsInline={playsInline}
      preload="metadata"
      onEnded={onEnded}
      onTimeUpdate={
        onTimeUpdate
          ? (e) => onTimeUpdate(e.currentTarget.currentTime, e.currentTarget.duration)
          : undefined
      }
    />
  );
}
