import { getConfig } from "./config";

/**
 * Client calls to the RouGee sounds Worker — a discovery index of which reels
 * use a qRougee track (the chain has no such lookup). When a reel with a track
 * is published we tell the Worker; it re-verifies on-chain before counting, so a
 * use can't be faked. Dormant until VITE_SOUNDS_WORKER_URL is set.
 */
export function soundsEnabled(): boolean {
  return Boolean(getConfig().soundsWorkerUrl);
}

function base(): string {
  return getConfig().soundsWorkerUrl.replace(/\/$/, "");
}

export interface SoundUse {
  postId: string;
  from: string;
  at: number;
}
export interface SoundSummary {
  soundId: string;
  title: string;
  artist: string;
  count: number;
  reels: SoundUse[];
}
export interface TrendingSound {
  soundId: string;
  title: string;
  artist: string;
  count: number;
  lastAt: number;
}

/** Record (chain-verified) that a reel uses a track. Best-effort, fire-and-forget. */
export async function recordSoundUse(postId: string, soundId: string): Promise<void> {
  if (!soundsEnabled() || !postId || !soundId) return;
  try {
    await fetch(`${base()}/use`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: getConfig().network, postId, soundId }),
    });
  } catch {
    /* best-effort */
  }
}

/** Reels using a track, newest first (plus the track's title/artist/count). */
export async function fetchSoundReels(soundId: string): Promise<SoundSummary | null> {
  if (!soundsEnabled() || !soundId) return null;
  try {
    const params = new URLSearchParams({ network: getConfig().network, soundId });
    const res = await fetch(`${base()}/sound?${params.toString()}`);
    if (!res.ok) return null;
    return (await res.json()) as SoundSummary;
  } catch {
    return null;
  }
}

/** Most-used tracks, by use count then recency. */
export async function fetchTrendingSounds(limit = 20): Promise<TrendingSound[]> {
  if (!soundsEnabled()) return [];
  try {
    const params = new URLSearchParams({ network: getConfig().network, limit: String(limit) });
    const res = await fetch(`${base()}/trending?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { sounds?: TrendingSound[] };
    return Array.isArray(data.sounds) ? data.sounds : [];
  } catch {
    return [];
  }
}
