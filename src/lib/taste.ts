/**
 * Device-local "taste profile" for the personalized Discover feed. We record
 * lightweight signals when you engage (open a post, like it) — which authors and
 * hashtags you gravitate to — and keep running, time-decayed affinity scores in
 * localStorage, keyed by your pubkey. The re-ranker (useDiscoverFeed) reads this
 * to nudge matching posts up.
 *
 * Privacy: this never leaves the device. No server sees your taste — fitting for
 * an un-deplatformable app. Cold-start (no history) → no effect, feed ranks as
 * before.
 */

const KEY = "rougee-gram:taste";
const MAX_AUTHORS = 200;
const MAX_TAGS = 100;
const HALF_LIFE_DAYS = 14; // affinity halves every ~2 weeks, so taste stays current

interface TasteStore {
  authors: Record<string, number>;
  tags: Record<string, number>;
  at: number; // last-updated ms (for decay)
}

export interface TasteProfile {
  /** Author pubkey → affinity, normalized 0..1. */
  authors: Record<string, number>;
  /** Hashtag (lowercase) → affinity, normalized 0..1. */
  tags: Record<string, number>;
  /** Whether there's any signal yet (cold-start guard). */
  hasData: boolean;
}

/** Signal weights by action. Likes are the strongest intent we track cheaply. */
export const TASTE_WEIGHTS = { open: 0.5, like: 1, repost: 1.5, follow: 2, save: 1 };

function readStore(pubkey: string): TasteStore {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, TasteStore>;
    const s = all[pubkey];
    if (s && typeof s === "object") {
      return { authors: s.authors || {}, tags: s.tags || {}, at: s.at || Date.now() };
    }
  } catch {
    /* ignore */
  }
  return { authors: {}, tags: {}, at: Date.now() };
}

function writeStore(pubkey: string, store: TasteStore): void {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) || "{}") as Record<string, TasteStore>;
    all[pubkey] = store;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage may be unavailable */
  }
}

function decayFactor(lastAt: number): number {
  const days = (Date.now() - lastAt) / 86_400_000;
  return days <= 0 ? 1 : Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/** Keep only the top `max` entries (and drop negligible ones) to stay bounded. */
function prune(map: Record<string, number>, max: number): void {
  const entries = Object.entries(map).filter(([, v]) => v > 0.05);
  if (entries.length <= max) {
    for (const k of Object.keys(map)) if (!(map[k] > 0.05)) delete map[k];
    return;
  }
  entries.sort((a, b) => b[1] - a[1]);
  const keep = new Set(entries.slice(0, max).map(([k]) => k));
  for (const k of Object.keys(map)) if (!keep.has(k)) delete map[k];
}

// Avoid over-counting the same post within a session (e.g. re-opening it).
const sessionSeen = new Set<string>();

/** Record an engagement signal. `dedupeKey` (e.g. `${action}:${postId}`) makes
 *  repeated identical actions this session count once. */
export function recordTaste(
  pubkey: string,
  signal: { author?: string; tags?: string[]; weight: number; dedupeKey?: string },
): void {
  if (!pubkey || !(signal.weight > 0)) return;
  if (signal.dedupeKey) {
    if (sessionSeen.has(signal.dedupeKey)) return;
    sessionSeen.add(signal.dedupeKey);
  }
  const store = readStore(pubkey);
  const f = decayFactor(store.at);
  for (const k in store.authors) store.authors[k] *= f;
  for (const k in store.tags) store.tags[k] *= f;
  if (signal.author) {
    store.authors[signal.author] = (store.authors[signal.author] ?? 0) + signal.weight;
  }
  for (const tag of signal.tags ?? []) {
    store.tags[tag] = (store.tags[tag] ?? 0) + signal.weight * 0.5;
  }
  store.at = Date.now();
  prune(store.authors, MAX_AUTHORS);
  prune(store.tags, MAX_TAGS);
  writeStore(pubkey, store);
}

/** The current (decayed, normalized 0..1) taste profile. */
export function getTasteProfile(pubkey: string | undefined): TasteProfile {
  const empty: TasteProfile = { authors: {}, tags: {}, hasData: false };
  if (!pubkey) return empty;
  const store = readStore(pubkey);
  const f = decayFactor(store.at);
  const norm = (src: Record<string, number>): Record<string, number> => {
    let max = 0;
    for (const k in src) max = Math.max(max, src[k] * f);
    const out: Record<string, number> = {};
    if (max > 0) for (const k in src) out[k] = (src[k] * f) / max;
    return out;
  };
  const authors = norm(store.authors);
  const tags = norm(store.tags);
  return { authors, tags, hasData: Object.keys(authors).length > 0 || Object.keys(tags).length > 0 };
}

/** Lowercase hashtags found in free text. */
export function tagsFromText(text: string | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  for (const m of text.matchAll(/#([a-z0-9_]{2,30})/gi)) out.add(m[1].toLowerCase());
  return [...out];
}
