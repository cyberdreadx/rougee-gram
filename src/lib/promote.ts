import { getConfig } from "./config";

/**
 * Client calls to the RouGee promote Worker (watch-to-earn ads / boosted posts).
 * Advertisers pay XRGE to the ad-pool wallet to boost a post; eligible viewers
 * earn a micro-reward per view, accrued and paid out on claim.
 */

export interface PromotedAd {
  postId: string;
  author: string;
  weight: number;
}

export function promoteEnabled(): boolean {
  return Boolean(getConfig().promoteWorkerUrl);
}

function base(): string {
  return getConfig().promoteWorkerUrl.replace(/\/$/, "");
}

let poolAddr: string | null = null;
/** The ad-pool wallet address advertisers pay to boost (cached). */
export async function getPoolAddress(): Promise<string | null> {
  if (poolAddr) return poolAddr;
  if (!promoteEnabled()) return null;
  try {
    const res = await fetch(`${base()}/pool`);
    if (!res.ok) return null;
    const d = (await res.json()) as { address?: string };
    poolAddr = d.address ?? null;
    return poolAddr;
  } catch {
    return null;
  }
}

/** Active promoted posts for the current network (weighted by spend). */
export async function getPromoted(): Promise<PromotedAd[]> {
  if (!promoteEnabled()) return [];
  try {
    const params = new URLSearchParams({ network: getConfig().network, limit: "10" });
    const res = await fetch(`${base()}/promoted?${params}`);
    if (!res.ok) return [];
    const d = (await res.json()) as { ads?: PromotedAd[] };
    return Array.isArray(d.ads) ? d.ads : [];
  } catch {
    return [];
  }
}

/** Register a boost after paying the ad-pool. Best-effort; the worker re-verifies
 *  the payment on-chain. */
export async function recordBoost(
  postId: string,
  txId: string,
  durationHours: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!promoteEnabled()) return { ok: false, error: "Promotion isn't available." };
  try {
    const res = await fetch(`${base()}/boost`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: getConfig().network, postId, txId, durationHours }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    return { ok: res.ok && !!d.ok, error: d.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Boost failed" };
  }
}

/** Record a sponsored-post view; returns any reward earned. Fire-and-forget. */
export async function recordImpression(
  postId: string,
  viewer: string,
): Promise<{ earned: number; balance: number }> {
  if (!promoteEnabled() || !postId || !viewer) return { earned: 0, balance: 0 };
  try {
    const res = await fetch(`${base()}/impression`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: getConfig().network, postId, viewer }),
    });
    if (!res.ok) return { earned: 0, balance: 0 };
    const d = (await res.json()) as { earned?: number; balance?: number };
    return { earned: Number(d.earned) || 0, balance: Number(d.balance) || 0 };
  } catch {
    return { earned: 0, balance: 0 };
  }
}

export interface Earnings {
  balance: number;
  claimMin: number;
}

/** A viewer's accrued (claimable) ad-view earnings. */
export async function getEarnings(viewer: string): Promise<Earnings> {
  if (!promoteEnabled() || !viewer) return { balance: 0, claimMin: 0 };
  try {
    const params = new URLSearchParams({ network: getConfig().network, viewer });
    const res = await fetch(`${base()}/earnings?${params}`);
    if (!res.ok) return { balance: 0, claimMin: 0 };
    const d = (await res.json()) as Partial<Earnings>;
    return { balance: Number(d.balance) || 0, claimMin: Number(d.claimMin) || 0 };
  } catch {
    return { balance: 0, claimMin: 0 };
  }
}

/** Claim accrued earnings — the pool wallet pays out in one transfer. */
export async function claimEarnings(
  viewer: string,
): Promise<{ ok: boolean; claimed?: number; error?: string }> {
  if (!promoteEnabled()) return { ok: false, error: "Not available." };
  try {
    const res = await fetch(`${base()}/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: getConfig().network, viewer }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      claimed?: number;
      error?: string;
    };
    return { ok: res.ok && !!d.ok, claimed: d.claimed, error: d.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Claim failed" };
  }
}
