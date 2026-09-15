import type { SocialPost } from "@rougechain/sdk";
import { useGlobalTimeline } from "./useSocial";
import { useAuth } from "@/store/auth";
import { decodeBody, STORY_TTL_MS } from "@/lib/envelope";

export interface StoryGroup {
  pubkey: string;
  stories: SocialPost[]; // oldest → newest (viewing order)
  latest: number;
}

function toMs(s: string): number {
  const n = Number(s);
  if (!Number.isNaN(n) && s.trim() !== "") return n < 1e12 ? n * 1000 : n;
  const p = Date.parse(s);
  return Number.isNaN(p) ? 0 : p;
}

/** Active (<24h) stories from the global timeline, grouped by author, self first. */
export function useStoryGroups(): { groups: StoryGroup[]; isLoading: boolean } {
  const { publicKey } = useAuth();
  const { data, isLoading } = useGlobalTimeline();
  const now = Date.now();

  const map = new Map<string, SocialPost[]>();
  for (const p of data ?? []) {
    if (p.reply_to_id) continue;
    if (decodeBody(p.body).kind !== "story") continue;
    const t = toMs(p.created_at);
    if (!t || now - t > STORY_TTL_MS) continue;
    const arr = map.get(p.author_pubkey) ?? [];
    arr.push(p);
    map.set(p.author_pubkey, arr);
  }

  const groups: StoryGroup[] = [];
  for (const [pubkey, stories] of map) {
    stories.sort((a, b) => toMs(a.created_at) - toMs(b.created_at));
    groups.push({
      pubkey,
      stories,
      latest: Math.max(...stories.map((s) => toMs(s.created_at))),
    });
  }
  groups.sort((a, b) => {
    if (a.pubkey === publicKey) return -1;
    if (b.pubkey === publicKey) return 1;
    return b.latest - a.latest;
  });

  return { groups, isLoading };
}

const SEEN_KEY = "rougee-gram:stories-seen";

export function getSeenStories(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

export function markStoriesSeen(ids: string[]): void {
  try {
    const s = getSeenStories();
    ids.forEach((i) => s.add(i));
    // Keep the set bounded.
    localStorage.setItem(SEEN_KEY, JSON.stringify([...s].slice(-500)));
  } catch {
    /* ignore */
  }
}

export function groupHasUnseen(group: StoryGroup, seen: Set<string>): boolean {
  return group.stories.some((s) => !seen.has(s.id));
}
