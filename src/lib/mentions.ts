import { getConfig } from "./config";

/**
 * Client calls to the RouGee mentions Worker. @handles are claimable usernames
 * ([a-z0-9_], 3–20 chars). When a post is published we tell the Worker which
 * handles it mentions; the Worker re-verifies against the chain before counting
 * them, so a mention can't be faked. The mentioned user reads theirs in Activity.
 */

/** Matches @handle tokens in text; capture group 1 is the bare handle. */
export const MENTION_RE = /(^|[^a-zA-Z0-9_@])@([a-z0-9_]{3,20})(?![a-z0-9_])/gi;

/** Unique lowercase handles mentioned in a piece of text. */
export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(MENTION_RE)) out.add(m[2].toLowerCase());
  return [...out];
}

export function mentionsEnabled(): boolean {
  return Boolean(getConfig().mentionsWorkerUrl);
}

function base(): string {
  return getConfig().mentionsWorkerUrl.replace(/\/$/, "");
}

export interface Mention {
  postId: string;
  from: string;
  at: number;
}

/** Record (chain-verified) that a post mentions these handles. Best-effort. */
export async function recordMentions(postId: string, handles: string[]): Promise<void> {
  if (!mentionsEnabled() || !postId || !handles.length) return;
  try {
    await fetch(`${base()}/mention`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: getConfig().network, postId, handles }),
    });
  } catch {
    /* best-effort */
  }
}

/** Posts that mention a handle, newest first. */
export async function getMentions(handle: string): Promise<Mention[]> {
  if (!mentionsEnabled() || !handle) return [];
  try {
    const params = new URLSearchParams({ network: getConfig().network, handle: handle.toLowerCase() });
    const res = await fetch(`${base()}/mentions?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { mentions?: Mention[] };
    return Array.isArray(data.mentions) ? data.mentions : [];
  } catch {
    return [];
  }
}
