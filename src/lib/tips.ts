import { getConfig } from "./config";

/**
 * Client calls to the RouGee tips-ledger Worker (per-post tip attribution).
 *
 * A RougeChain transfer carries no post reference, so after a tip succeeds we
 * tell the Worker which post the transfer <txId> was for. The Worker re-verifies
 * the transfer on-chain before counting it, so a failed/tampered report is
 * simply rejected — recording is best-effort and never blocks the tip itself.
 */

export interface Tipper {
  from: string;
  amount: number;
  at: number;
}

export interface PostTips {
  total: number;
  count: number;
  tippers: Tipper[];
}

export const EMPTY_TIPS: PostTips = { total: 0, count: 0, tippers: [] };

/** True when a tips Worker is configured for this build. */
export function tipsEnabled(): boolean {
  return Boolean(getConfig().tipsWorkerUrl);
}

function base(): string {
  return getConfig().tipsWorkerUrl.replace(/\/$/, "");
}

async function postTip(postId: string, txId: string): Promise<number> {
  try {
    const res = await fetch(`${base()}/tip`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: getConfig().network, postId, txId }),
    });
    return res.status;
  } catch {
    return 0; // network error — treat as transient
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Record an on-chain transfer as a tip on a post. Best-effort — resolves false
 * on failure so a tip is never lost just because attribution didn't stick.
 *
 * The Worker verifies the tx against the chain, but a just-submitted transfer
 * isn't queryable by hash until it lands in a block, so we retry on 404/5xx/
 * network errors with backoff. A 400 (e.g. recipient isn't the post's author)
 * is permanent — stop immediately.
 */
export async function recordTip(postId: string, txId: string): Promise<boolean> {
  if (!tipsEnabled() || !postId || !txId) return false;
  const backoff = [0, 2500, 5000, 10000];
  for (let i = 0; i < backoff.length; i++) {
    if (backoff[i]) await sleep(backoff[i]);
    const status = await postTip(postId, txId);
    if (status === 200) return true;
    if (status >= 400 && status < 500 && status !== 404) return false; // permanent
  }
  return false;
}

/** Total + tippers for a post. Returns empty when tips aren't configured. */
export async function getPostTips(postId: string): Promise<PostTips> {
  if (!tipsEnabled() || !postId) return EMPTY_TIPS;
  try {
    const params = new URLSearchParams({ network: getConfig().network, postId });
    const res = await fetch(`${base()}/tips?${params.toString()}`);
    if (!res.ok) return EMPTY_TIPS;
    const data = (await res.json()) as Partial<PostTips>;
    return {
      total: Number(data.total) || 0,
      count: Number(data.count) || 0,
      tippers: Array.isArray(data.tippers) ? data.tippers : [],
    };
  } catch {
    return EMPTY_TIPS;
  }
}
