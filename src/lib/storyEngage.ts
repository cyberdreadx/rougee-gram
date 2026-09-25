import { getConfig } from "./config";

/**
 * Client calls to the RouGee story-engagement Worker (off-chain views +
 * reactions for ephemeral stories). All best-effort: a story view or reaction
 * must never block or error the viewer's experience.
 */

export interface StoryView {
  viewer: string;
  at: number;
}
export interface StoryReaction {
  from: string;
  emoji: string;
  at: number;
}
export interface StoryEngagement {
  viewCount: number;
  views: StoryView[];
  reactions: StoryReaction[];
}

export const EMPTY_ENGAGEMENT: StoryEngagement = { viewCount: 0, views: [], reactions: [] };

export function storyEngageEnabled(): boolean {
  return Boolean(getConfig().storyWorkerUrl);
}

function base(): string {
  return getConfig().storyWorkerUrl.replace(/\/$/, "");
}

/** Record that `viewer` opened `storyId`. Fire-and-forget. */
export async function recordStoryView(storyId: string, viewer: string): Promise<void> {
  if (!storyEngageEnabled() || !storyId || !viewer) return;
  try {
    await fetch(`${base()}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: getConfig().network, storyId, viewer }),
    });
  } catch {
    /* ignore */
  }
}

/** Set (or clear, with emoji="") the viewer's reaction to a story. */
export async function reactToStory(
  storyId: string,
  viewer: string,
  emoji: string,
): Promise<boolean> {
  if (!storyEngageEnabled() || !storyId || !viewer) return false;
  try {
    const res = await fetch(`${base()}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: getConfig().network, storyId, viewer, emoji }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Views + reactions for a story (empty when the worker isn't configured). */
export async function getStoryEngagement(storyId: string): Promise<StoryEngagement> {
  if (!storyEngageEnabled() || !storyId) return EMPTY_ENGAGEMENT;
  try {
    const params = new URLSearchParams({ network: getConfig().network, storyId });
    const res = await fetch(`${base()}/story?${params.toString()}`);
    if (!res.ok) return EMPTY_ENGAGEMENT;
    const d = (await res.json()) as Partial<StoryEngagement>;
    return {
      viewCount: Number(d.viewCount) || 0,
      views: Array.isArray(d.views) ? d.views : [],
      reactions: Array.isArray(d.reactions) ? d.reactions : [],
    };
  } catch {
    return EMPTY_ENGAGEMENT;
  }
}
