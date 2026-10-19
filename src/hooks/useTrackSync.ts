import { useEffect, type RefObject } from "react";

/**
 * Keep a reel's music <audio> aligned to its muted <video>. Two media elements
 * always drift a little; this holds them close without ever fighting the
 * players — which matters on iOS Safari, where high-frequency seeks or a
 * non-1.0 playbackRate will silence or stall an audio element outright.
 *
 *  - Audio STARTS only on the video's real `playing` event (not while it's
 *    buffering — the "music plays first" bug) and pauses on pause/stall/end.
 *  - On each `timeupdate` we nudge the track back only when it has drifted past
 *    a threshold (one occasional seek), and re-cue to the start offset when the
 *    looping video wraps. No per-frame work, no tempo changes.
 */
export function useTrackSync({
  videoRef,
  audioRef,
  enabled,
  soundStart,
  clipStart,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  audioRef: RefObject<HTMLAudioElement | null>;
  enabled: boolean;
  /** Offset into the track where playback should begin (seconds). */
  soundStart: number;
  /** Where the video clip itself starts (seconds); 0 for a full video. */
  clipStart?: number;
}) {
  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v || !a || !enabled) return;

    const base = clipStart ?? 0;
    const DRIFT = 0.18; // only re-seek once the track is >180ms out of step

    const target = () => soundStart + Math.max(0, v.currentTime - base);
    const align = () => {
      const t = target();
      if (Math.abs(a.currentTime - t) > DRIFT) {
        try {
          a.currentTime = t;
        } catch {
          /* seek not ready yet */
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
        if (a.paused && !v.paused) a.play().catch(() => {});
      } else {
        align();
      }
      last = v.currentTime;
    };

    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onStop);
    v.addEventListener("waiting", onStop);
    v.addEventListener("stalled", onStop);
    v.addEventListener("ended", onStop);
    v.addEventListener("timeupdate", onTime);
    if (!v.paused && v.readyState >= 3) onPlaying(); // already rolling on mount

    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onStop);
      v.removeEventListener("waiting", onStop);
      v.removeEventListener("stalled", onStop);
      v.removeEventListener("ended", onStop);
      v.removeEventListener("timeupdate", onTime);
      a.pause();
    };
  }, [videoRef, audioRef, enabled, soundStart, clipStart]);
}
