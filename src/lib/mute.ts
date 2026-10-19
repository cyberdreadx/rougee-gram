/**
 * Universal feed-video mute (Instagram-style): ONE preference controls every
 * in-feed video and reel, remembered across sessions. Unmute once and it stays
 * unmuted as you scroll (and in the reels feed, and next session); mute once and
 * everything goes quiet. Default: muted (feed videos never autoplay with sound).
 */
import { useSyncExternalStore } from "react";

const KEY = "rougee-gram:feed-muted";

let muted = (() => {
  try {
    return localStorage.getItem(KEY) !== "0"; // default muted unless explicitly "0"
  } catch {
    return true;
  }
})();

const listeners = new Set<() => void>();

export function getFeedMuted(): boolean {
  return muted;
}

export function setFeedMuted(v: boolean): void {
  if (v === muted) return;
  muted = v;
  try {
    localStorage.setItem(KEY, v ? "1" : "0");
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive universal mute: `[muted, setMuted]`, shared across all players. */
export function useFeedMuted(): [boolean, (v: boolean) => void] {
  const m = useSyncExternalStore(subscribe, getFeedMuted, getFeedMuted);
  return [m, setFeedMuted];
}
