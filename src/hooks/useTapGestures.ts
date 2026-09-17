import { useEffect, useRef } from "react";

interface Options {
  /** Fired on a confirmed single tap (after the double-tap window elapses). */
  onSingleTap?: () => void;
  /** Fired on a double tap. */
  onDoubleTap?: () => void;
  /** Fired once the press has been held past `holdMs` without moving. */
  onHoldStart?: () => void;
  /** Fired when a hold ends (pointer up / cancel / leave). */
  onHoldEnd?: () => void;
  /** How long a stationary press must last to count as a hold. */
  holdMs?: number;
  /** Max gap between two taps to count as a double tap. */
  doubleMs?: number;
  /** Movement (px) that turns a press into a scroll/drag and cancels the gesture. */
  moveTolerance?: number;
}

interface Handlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
}

/**
 * Pointer-based tap / double-tap / press-and-hold detector for media surfaces
 * (reels, fullscreen video, stories). Distinguishes:
 *   - single tap  → `onSingleTap` (after the double-tap window)
 *   - double tap  → `onDoubleTap`
 *   - hold        → `onHoldStart` while held, `onHoldEnd` on release
 *
 * A press that moves past `moveTolerance` (a scroll/swipe) cancels cleanly so it
 * doesn't fire a tap or leave the media paused. Callbacks are read through a ref
 * so the returned handlers stay stable and always call the latest closures.
 */
export function useTapGestures(opts: Options): Handlers {
  const {
    holdMs = 260,
    doubleMs = 260,
    moveTolerance = 12,
  } = opts;

  const cb = useRef(opts);
  cb.current = opts;

  const holdTimer = useRef<number | null>(null);
  const singleTimer = useRef<number | null>(null);
  const holding = useRef(false);
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  const clearHold = () => {
    if (holdTimer.current != null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  const clearSingle = () => {
    if (singleTimer.current != null) {
      clearTimeout(singleTimer.current);
      singleTimer.current = null;
    }
  };

  // Clean up timers on unmount; resume anything left paused by a hold.
  useEffect(
    () => () => {
      clearHold();
      clearSingle();
      if (holding.current) cb.current.onHoldEnd?.();
    },
    [],
  );

  function endPress(cancelled: boolean) {
    clearHold();
    if (holding.current) {
      holding.current = false;
      cb.current.onHoldEnd?.();
      return;
    }
    if (cancelled || moved.current) return;
    // A completed tap. If a prior tap is still pending, this is a double tap.
    if (singleTimer.current != null) {
      clearSingle();
      cb.current.onDoubleTap?.();
    } else {
      singleTimer.current = window.setTimeout(() => {
        singleTimer.current = null;
        cb.current.onSingleTap?.();
      }, doubleMs);
    }
  }

  return {
    onPointerDown(e) {
      moved.current = false;
      holding.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      clearHold();
      holdTimer.current = window.setTimeout(() => {
        holding.current = true;
        // A hold supersedes any pending single tap from a previous press.
        clearSingle();
        cb.current.onHoldStart?.();
      }, holdMs);
    },
    onPointerMove(e) {
      if (moved.current) return;
      const dx = e.clientX - start.current.x;
      const dy = e.clientY - start.current.y;
      if (Math.hypot(dx, dy) > moveTolerance) {
        moved.current = true;
        clearHold();
        if (holding.current) {
          holding.current = false;
          cb.current.onHoldEnd?.();
        }
      }
    },
    onPointerUp() {
      endPress(false);
    },
    onPointerCancel() {
      endPress(true);
    },
  };
}
