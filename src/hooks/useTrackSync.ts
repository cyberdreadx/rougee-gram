import { useEffect, type RefObject } from "react";

/**
 * Frame-accurate A/V sync for a muted <video> with a separate music <audio>
 * track (reels). Two independent media elements always drift; this keeps them
 * locked like a PLL:
 *
 *  - The VIDEO is the master clock. We read its true on-screen position from
 *    `requestVideoFrameCallback` (the timestamp of the frame actually being
 *    presented) — far tighter than the ~4Hz `timeupdate` event. Falls back to
 *    requestAnimationFrame + currentTime where rVFC is unavailable.
 *  - Audio STARTS only on the video's real `playing` event (not while buffering
 *    — the "music plays first" bug) and pauses on pause/stall.
 *  - Drift correction is graded: tiny drift → nudge audio `playbackRate` a few
 *    percent (pitch-preserved, inaudible) to ease back in; large drift or a loop
 *    wrap → one hard seek. No constant seeking, so no audible stutter.
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
    // Tempo-shift without pitch change so micro-corrections stay inaudible.
    setPreservesPitch(a, true);

    const HARD = 0.08; // > 80ms off → one hard seek (loop wrap, scrub, big stall)
    const SOFT = 0.012; // > 12ms off → gentle tempo pull toward the target
    const GAIN = 0.5; // how hard the tempo pull reacts to drift
    const MAX_RATE = 0.05; // cap tempo change at ±5%

    const vfc = getRVFC(v);
    let frameId = 0;
    let rafId = 0;
    let running = false;
    let lastMedia = -1;

    const targetFor = (mediaTime: number) => soundStart + Math.max(0, mediaTime - base);

    const correct = (mediaTime: number) => {
      if (v.paused) return;

      // Loop wrap: the video jumped backwards → re-cue the track to its offset.
      if (lastMedia >= 0 && mediaTime < lastMedia - 0.05) {
        hardSeek(a, targetFor(mediaTime));
        a.playbackRate = 1;
        lastMedia = mediaTime;
        return;
      }
      lastMedia = mediaTime;

      // Only touch audio once the video genuinely has data to play; during a
      // stall readyState drops, so this also prevents a premature resume.
      if (v.readyState < 3) return;
      if (a.paused) a.play().catch(() => {});

      const target = targetFor(mediaTime);
      const drift = a.currentTime - target; // >0 audio ahead, <0 audio behind
      const mag = Math.abs(drift);
      if (mag > HARD) {
        hardSeek(a, target);
        a.playbackRate = 1;
      } else if (mag > SOFT) {
        // Ahead → slow down (<1); behind → speed up (>1). Converges smoothly.
        const nudge = Math.max(-MAX_RATE, Math.min(MAX_RATE, -drift * GAIN));
        a.playbackRate = 1 + nudge;
      } else {
        a.playbackRate = 1;
      }
    };

    const onVFrame = (_now: number, meta: { mediaTime: number }) => {
      correct(meta.mediaTime);
      if (running && vfc) frameId = vfc.request(onVFrame);
    };
    const onRaf = () => {
      correct(v.currentTime);
      if (running) rafId = requestAnimationFrame(onRaf);
    };
    const startLoop = () => {
      if (running) return;
      running = true;
      if (vfc) frameId = vfc.request(onVFrame);
      else rafId = requestAnimationFrame(onRaf);
    };
    const stopLoop = () => {
      running = false;
      if (vfc && frameId) vfc.cancel(frameId);
      if (rafId) cancelAnimationFrame(rafId);
      frameId = 0;
      rafId = 0;
    };

    const onPlaying = () => {
      hardSeek(a, targetFor(v.currentTime)); // snap once, loop fine-tunes after
      a.play().catch(() => {});
      startLoop();
    };
    const onHold = () => {
      a.pause();
      a.playbackRate = 1;
    };

    v.addEventListener("playing", onPlaying);
    v.addEventListener("pause", onHold);
    v.addEventListener("waiting", onHold);
    v.addEventListener("stalled", onHold);
    v.addEventListener("ended", onHold);
    if (!v.paused && v.readyState >= 3) onPlaying(); // already rolling on mount

    return () => {
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("pause", onHold);
      v.removeEventListener("waiting", onHold);
      v.removeEventListener("stalled", onHold);
      v.removeEventListener("ended", onHold);
      stopLoop();
      a.pause();
      a.playbackRate = 1;
    };
  }, [videoRef, audioRef, enabled, soundStart, clipStart]);
}

function hardSeek(a: HTMLAudioElement, t: number) {
  try {
    a.currentTime = t;
  } catch {
    /* seek not ready yet */
  }
}

function setPreservesPitch(a: HTMLAudioElement, on: boolean) {
  const el = a as HTMLAudioElement & {
    preservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
    mozPreservesPitch?: boolean;
  };
  el.preservesPitch = on;
  el.webkitPreservesPitch = on;
  el.mozPreservesPitch = on;
}

/** Narrow wrapper over the (not-yet-in-lib-dom) requestVideoFrameCallback API. */
function getRVFC(
  v: HTMLVideoElement,
): { request: (cb: (now: number, meta: { mediaTime: number }) => void) => number; cancel: (id: number) => void } | null {
  const el = v as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
    cancelVideoFrameCallback?: (id: number) => void;
  };
  if (typeof el.requestVideoFrameCallback !== "function") return null;
  return {
    request: (cb) => el.requestVideoFrameCallback!(cb),
    cancel: (id) => el.cancelVideoFrameCallback?.(id),
  };
}
