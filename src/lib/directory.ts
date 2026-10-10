import { getConfig } from "./config";

/**
 * Client calls to the RouGee username directory Worker (prefix search for
 * @mentions). The node has no name enumeration, so the directory is crowd-filled:
 * every handle the app registers or resolves is indexed here (re-verified
 * on-chain by the Worker). searchUsers() then does a prefix lookup.
 */

export interface DirectoryUser {
  handle: string;
  pubkey: string;
}

export function directoryEnabled(): boolean {
  return Boolean(getConfig().directoryWorkerUrl);
}

function base(): string {
  return getConfig().directoryWorkerUrl.replace(/\/$/, "");
}

/** Handles starting with `prefix` (empty for too-short/unavailable). */
export async function searchUsers(prefix: string, limit = 8): Promise<DirectoryUser[]> {
  const q = prefix.trim().toLowerCase();
  if (!directoryEnabled() || !q) return [];
  try {
    const params = new URLSearchParams({ network: getConfig().network, q, limit: String(limit) });
    const res = await fetch(`${base()}/search?${params.toString()}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: DirectoryUser[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

// Don't re-POST the same handle repeatedly within a session.
const indexed = new Set<string>();

/** Add/refresh a handle in the search directory (fire-and-forget, deduped). */
export function indexUsername(handle: string): void {
  const h = handle.trim().toLowerCase();
  if (!directoryEnabled() || !h || indexed.has(h)) return;
  indexed.add(h);
  fetch(`${base()}/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ network: getConfig().network, handle: h }),
  }).catch(() => {
    indexed.delete(h); // allow a retry next time
  });
}
