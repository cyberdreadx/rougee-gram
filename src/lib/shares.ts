import { getConfig } from "./config";

/**
 * Client calls to the RouGee share-counter Worker (per-post share tally).
 * Sharing isn't an on-chain action, so this is an off-chain vanity counter
 * (like views). Best-effort — failures never block the share itself.
 */
export function sharesEnabled(): boolean {
  return Boolean(getConfig().sharesWorkerUrl);
}

function base(): string {
  return getConfig().sharesWorkerUrl.replace(/\/$/, "");
}

/** Increment a post's share count. Returns the new count, or null on failure. */
export async function recordShare(postId: string): Promise<number | null> {
  if (!sharesEnabled() || !postId) return null;
  try {
    const res = await fetch(`${base()}/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: getConfig().network, postId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { count?: number };
    return Number(data.count) || 0;
  } catch {
    return null;
  }
}

/** Current share count for a post (0 when unavailable). */
export async function getShareCount(postId: string): Promise<number> {
  if (!sharesEnabled() || !postId) return 0;
  try {
    const params = new URLSearchParams({ network: getConfig().network, postId });
    const res = await fetch(`${base()}/shares?${params.toString()}`);
    if (!res.ok) return 0;
    const data = (await res.json()) as { count?: number };
    return Number(data.count) || 0;
  } catch {
    return 0;
  }
}
