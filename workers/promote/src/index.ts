/**
 * RouGee promote — watch-to-earn ad engine.
 *
 * Advertisers boost a post by paying XRGE to the ad-pool wallet. Most of that
 * (VIEWER_POOL_PCT) funds a reward pool; viewers who actually see the sponsored
 * post earn a micro-reward once per ad. Earnings accrue and are paid out in one
 * transfer per claim (fees make per-view payouts impossible). Payment is
 * verified on-chain; eligibility (hold ≥ EARN_MIN) is checked on-chain to blunt
 * Sybil farming. The remaining (1 - VIEWER_POOL_PCT) stays in the pool wallet as
 * RouGee's cut + payout-fee reserve.
 *
 *   POST /boost      {network, postId, txId, durationHours} -> { ok, ad }
 *   GET  /promoted?network=&limit=                          -> { ads:[{postId,author,weight}] }
 *   GET  /ad?network=&postId=                               -> { found, active, spend, poolBalance, rewardsPaid, views, until }
 *   POST /impression {network, postId, viewer}              -> { ok, earned, balance }
 *   GET  /earnings?network=&viewer=                         -> { balance, claimMin }
 *   POST /claim      {network, viewer}                      -> { ok, claimed, txId }
 *   POST /click      {network, postId, viewer}              -> { ok, counted }
 *   POST /end        {network, signedTx}                    -> { ok, ad }   (author-signed)
 *   POST /pause      {network, signedTx}                    -> { ok, ad }   (author-signed)
 *   POST /resume     {network, signedTx}                    -> { ok, ad }   (author-signed)
 */
import { RougeChain, Wallet, pubkeyToAddress, verifyTransaction } from "@rougechain/sdk";
import type { SignedTransaction } from "@rougechain/sdk";

export interface Env {
  PROMOTE: KVNamespace;
  NODE_TESTNET: string;
  NODE_MAINNET: string;
  /** Ad-pool wallet recovery phrase (secret) — receives spend, pays rewards. */
  POOL_MNEMONIC: string;
  ALLOW_ORIGIN?: string;
  REWARD_PER_VIEW?: string;
  EARN_MIN_XRGE?: string;
  CLAIM_MIN_XRGE?: string;
  VIEWER_POOL_PCT?: string;
}

const HEX = /^[0-9a-f]+$/i;
const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const rewardPerView = (e: Env) => num(e.REWARD_PER_VIEW, 0.5);
const earnMin = (e: Env) => num(e.EARN_MIN_XRGE, 100);
const claimMin = (e: Env) => num(e.CLAIM_MIN_XRGE, 10);
const poolPct = (e: Env) => {
  const n = Number(e.VIEWER_POOL_PCT);
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.85;
};

function cors(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    ...extra,
  };
}
function json(body: unknown, status: number, env: Env): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors(env) },
  });
}
function nodeFor(env: Env, network: string): string | null {
  if (network === "testnet") return env.NODE_TESTNET?.replace(/\/$/, "") || null;
  if (network === "mainnet") return env.NODE_MAINNET?.replace(/\/$/, "") || null;
  return null;
}
async function keyId(pubkey: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pubkey));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Cache the pool wallet + address per isolate. */
let poolWallet: Wallet | null = null;
let poolAddress = "";
async function getPool(env: Env): Promise<{ wallet: Wallet; address: string }> {
  if (!poolWallet) {
    poolWallet = Wallet.fromMnemonic(env.POOL_MNEMONIC.trim());
    poolAddress = await pubkeyToAddress(poolWallet.publicKey);
  }
  return { wallet: poolWallet, address: poolAddress };
}

async function balanceOf(nodeApi: string, pubkey: string): Promise<number> {
  try {
    const res = (await new RougeChain(nodeApi).getBalance(pubkey)) as { balance?: number };
    return typeof res.balance === "number" ? res.balance : 0;
  } catch {
    return 0;
  }
}

interface ChainTx {
  tx_type?: string;
  from_pub_key?: string;
  payload?: { amount?: number; to_pub_key_hex?: string; token_name?: string };
}
async function fetchTx(nodeApi: string, hash: string): Promise<ChainTx | null> {
  try {
    const res = await fetch(`${nodeApi}/tx/${hash}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { success?: boolean; tx?: ChainTx };
    return data?.success && data.tx ? data.tx : null;
  } catch {
    return null;
  }
}

interface Ad {
  postId: string;
  author: string;
  poolBalance: number;
  weight: number;
  until: number;
  rewardPerView: number;
  /** Count of rewarded impressions (eligible viewers who earned). */
  viewsPaid?: number;
  /** Unique viewers who saw the ad (all viewers, rewarded or not). */
  impressions?: number;
  /** Unique viewers who clicked the ad's call-to-action. */
  clicks?: number;
  /** Author paused the campaign — hidden from feeds until resumed. */
  paused?: boolean;
  /** Remaining run-time (ms) captured at pause, restored on resume. */
  remainingMs?: number;
}

async function activeAds(env: Env, network: string): Promise<Ad[]> {
  const now = Date.now();
  const list = await env.PROMOTE.list({ prefix: `ad:${network}:`, limit: 1000 });
  const ads = await Promise.all(
    list.keys.map((k) => env.PROMOTE.get(k.name, "json") as Promise<Ad | null>),
  );
  return ads
    .filter((a): a is Ad => !!a && !a.paused && a.until > now && a.poolBalance >= a.rewardPerView)
    .sort((a, b) => b.weight - a.weight);
}

/**
 * Verify an author-signed campaign action. The wallet signs a payload WE define
 * (action + postId), so it's unambiguous — unlike the messenger read-signing
 * case where read and destructive payloads were byte-identical. We only act if
 * the signature is valid, fresh, un-replayed, and the signer owns the ad.
 */
type AuthResult =
  | { ok: true; ad: Ad; key: string }
  | { ok: false; status: number; error: string };
async function authedAd(
  env: Env,
  network: string,
  signedTx: SignedTransaction | undefined,
  action: string,
): Promise<AuthResult> {
  if (!signedTx?.payload || !signedTx.signature || !signedTx.public_key) {
    return { ok: false, status: 400, error: "missing signature" };
  }
  let valid = false;
  try {
    valid = verifyTransaction(signedTx);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, status: 401, error: "bad signature" };

  const p = signedTx.payload as unknown as {
    action?: string;
    network?: string;
    postId?: string;
    timestamp?: number;
    nonce?: string;
  };
  if (p.action !== action) return { ok: false, status: 400, error: "wrong action" };
  if (p.network !== network) return { ok: false, status: 400, error: "network mismatch" };
  if (!p.postId) return { ok: false, status: 400, error: "missing postId" };
  if (!(Math.abs(Date.now() - Number(p.timestamp)) < 5 * 60_000)) {
    return { ok: false, status: 400, error: "stale request" };
  }
  if (p.nonce) {
    const nkey = `nonce:${network}:${p.nonce}`;
    if (await env.PROMOTE.get(nkey)) return { ok: false, status: 400, error: "replayed" };
    await env.PROMOTE.put(nkey, "1", { expirationTtl: 600 });
  }
  const key = `ad:${network}:${p.postId}`;
  const ad = (await env.PROMOTE.get(key, "json")) as Ad | null;
  if (!ad) return { ok: false, status: 404, error: "no such ad" };
  if (ad.author !== signedTx.public_key) return { ok: false, status: 403, error: "not your ad" };
  return { ok: true, ad, key };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (e) {
      return json({ error: `Server error: ${e instanceof Error ? e.message : String(e)}` }, 500, env);
    }
  },
};

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

  // ── Ad-pool address (setup helper) ──
  if (request.method === "GET" && url.pathname === "/pool") {
    return json({ address: (await getPool(env)).address }, 200, env);
  }

  // ── Active promoted posts for feed injection ──
  if (request.method === "GET" && url.pathname === "/promoted") {
    const network = url.searchParams.get("network") || "";
    if (!nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
    const limit = Math.min(Number(url.searchParams.get("limit")) || 10, 50);
    const ads = (await activeAds(env, network)).slice(0, limit);
    return json({ ads: ads.map((a) => ({ postId: a.postId, author: a.author, weight: a.weight })) }, 200, env);
  }

  // ── Per-ad stats (for the advertiser's "Your ads" view) ──
  if (request.method === "GET" && url.pathname === "/ad") {
    const network = url.searchParams.get("network") || "";
    const postId = url.searchParams.get("postId") || "";
    if (!nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
    if (!postId) return json({ error: "missing postId" }, 400, env);
    const ad = (await env.PROMOTE.get(`ad:${network}:${postId}`, "json")) as Ad | null;
    if (!ad) return json({ found: false }, 200, env);
    const views = ad.viewsPaid || 0;
    const impressions = ad.impressions || 0;
    const clicks = ad.clicks || 0;
    return json(
      {
        found: true,
        active: !ad.paused && ad.until > Date.now() && ad.poolBalance >= ad.rewardPerView,
        paused: !!ad.paused,
        spend: ad.weight,
        poolBalance: ad.poolBalance,
        rewardsPaid: views * ad.rewardPerView,
        views,
        impressions,
        clicks,
        ctr: impressions > 0 ? clicks / impressions : 0,
        rewardPerView: ad.rewardPerView,
        until: ad.until,
      },
      200,
      env,
    );
  }

  // ── Viewer earnings ──
  if (request.method === "GET" && url.pathname === "/earnings") {
    const network = url.searchParams.get("network") || "";
    const viewer = url.searchParams.get("viewer") || "";
    if (!nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
    if (!viewer) return json({ error: "missing viewer" }, 400, env);
    const bal = Number((await env.PROMOTE.get(`bal:${network}:${await keyId(viewer)}`)) || 0);
    return json({ balance: bal, claimMin: claimMin(env) }, 200, env);
  }

  // ── Boost: verify the advertiser's on-chain payment, open/extend the ad ──
  if (request.method === "POST" && url.pathname === "/boost") {
    const { network, postId, txId, durationHours } = (await request.json().catch(() => ({}))) as {
      network?: string;
      postId?: string;
      txId?: string;
      durationHours?: number;
    };
    const nodeApi = network ? nodeFor(env, network) : null;
    if (!network || !nodeApi) return json({ error: "unsupported network" }, 400, env);
    if (!postId) return json({ error: "missing postId" }, 400, env);
    if (!txId || !HEX.test(txId)) return json({ error: "invalid txId" }, 400, env);

    const guard = `txused:${network}:${txId}`;
    if (await env.PROMOTE.get(guard)) {
      const ad = await env.PROMOTE.get(`ad:${network}:${postId}`, "json");
      return json({ ok: true, deduped: true, ad }, 200, env);
    }

    const tx = await fetchTx(nodeApi, txId);
    if (!tx) return json({ error: "transaction not found on chain" }, 404, env);
    if (tx.tx_type !== "transfer") return json({ error: "not a transfer" }, 400, env);
    const amount = Number(tx.payload?.amount);
    const to = tx.payload?.to_pub_key_hex;
    const from = tx.from_pub_key;
    const token = tx.payload?.token_name ?? "XRGE";
    if (!(amount > 0) || !to || !from) return json({ error: "malformed transfer" }, 400, env);
    if (token !== "XRGE") return json({ error: "only XRGE is accepted" }, 400, env);

    const { address: pool } = await getPool(env);
    if (to !== pool) return json({ error: "payment must go to the ad-pool wallet" }, 400, env);

    const hours = Math.max(1, Math.min(Number(durationHours) || 24, 24 * 30));
    const until = Date.now() + hours * 3600_000;
    const addToPool = amount * poolPct(env);

    const existing = (await env.PROMOTE.get(`ad:${network}:${postId}`, "json")) as Ad | null;
    const ad: Ad = existing
      ? {
          ...existing,
          poolBalance: existing.poolBalance + addToPool,
          weight: existing.weight + amount,
          until: Math.max(existing.until, until),
        }
      : { postId, author: from, poolBalance: addToPool, weight: amount, until, rewardPerView: rewardPerView(env) };

    await env.PROMOTE.put(`ad:${network}:${postId}`, JSON.stringify(ad));
    await env.PROMOTE.put(guard, postId);
    return json({ ok: true, ad }, 200, env);
  }

  // ── Impression: reward an eligible viewer once per ad ──
  if (request.method === "POST" && url.pathname === "/impression") {
    const { network, postId, viewer } = (await request.json().catch(() => ({}))) as {
      network?: string;
      postId?: string;
      viewer?: string;
    };
    const nodeApi = network ? nodeFor(env, network) : null;
    if (!network || !nodeApi) return json({ error: "unsupported network" }, 400, env);
    if (!postId || !viewer) return json({ error: "missing postId/viewer" }, 400, env);

    const ad = (await env.PROMOTE.get(`ad:${network}:${postId}`, "json")) as Ad | null;
    if (!ad || ad.until < Date.now() || ad.poolBalance < ad.rewardPerView) {
      return json({ ok: true, earned: 0 }, 200, env);
    }
    if (viewer === ad.author) return json({ ok: true, earned: 0, self: true }, 200, env);

    const vid = await keyId(viewer);
    const impKey = `imp:${network}:${postId}:${vid}`;
    if (await env.PROMOTE.get(impKey)) return json({ ok: true, earned: 0, alreadySeen: true }, 200, env);
    // Reserve the impression first so a double-tap can't double-reward.
    const ttl = Math.max(60, Math.ceil((ad.until - Date.now()) / 1000));
    await env.PROMOTE.put(impKey, "1", { expirationTtl: ttl });
    // Count the unique impression (every viewer who saw it, rewarded or not).
    ad.impressions = (ad.impressions || 0) + 1;

    // Sybil blunt: only accounts holding >= EARN_MIN earn. Ad still "shown".
    if ((await balanceOf(nodeApi, viewer)) < earnMin(env)) {
      await env.PROMOTE.put(`ad:${network}:${postId}`, JSON.stringify(ad));
      return json({ ok: true, earned: 0, ineligible: true }, 200, env);
    }

    const reward = ad.rewardPerView;
    ad.poolBalance = Math.max(0, ad.poolBalance - reward);
    ad.viewsPaid = (ad.viewsPaid || 0) + 1;
    await env.PROMOTE.put(`ad:${network}:${postId}`, JSON.stringify(ad));
    const balKey = `bal:${network}:${vid}`;
    const bal = Number((await env.PROMOTE.get(balKey)) || 0) + reward;
    await env.PROMOTE.put(balKey, String(bal));
    return json({ ok: true, earned: reward, balance: bal }, 200, env);
  }

  // ── Click: count a unique CTA click (for click-through-rate stats) ──
  if (request.method === "POST" && url.pathname === "/click") {
    const { network, postId, viewer } = (await request.json().catch(() => ({}))) as {
      network?: string;
      postId?: string;
      viewer?: string;
    };
    if (!network || !nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
    if (!postId) return json({ error: "missing postId" }, 400, env);

    const ad = (await env.PROMOTE.get(`ad:${network}:${postId}`, "json")) as Ad | null;
    if (!ad) return json({ ok: true, counted: false }, 200, env);
    if (viewer && viewer === ad.author) return json({ ok: true, counted: false, self: true }, 200, env);

    // Dedupe per viewer when we can identify them, so CTR reflects unique clicks.
    if (viewer) {
      const clkKey = `clk:${network}:${postId}:${await keyId(viewer)}`;
      if (await env.PROMOTE.get(clkKey)) return json({ ok: true, counted: false, alreadyClicked: true }, 200, env);
      const ttl = Math.max(60, Math.ceil((ad.until - Date.now()) / 1000));
      await env.PROMOTE.put(clkKey, "1", { expirationTtl: ttl });
    }
    ad.clicks = (ad.clicks || 0) + 1;
    await env.PROMOTE.put(`ad:${network}:${postId}`, JSON.stringify(ad));
    return json({ ok: true, counted: true }, 200, env);
  }

  // ── Claim: pay out accrued earnings in one transfer ──
  if (request.method === "POST" && url.pathname === "/claim") {
    const { network, viewer } = (await request.json().catch(() => ({}))) as {
      network?: string;
      viewer?: string;
    };
    const nodeApi = network ? nodeFor(env, network) : null;
    if (!network || !nodeApi) return json({ error: "unsupported network" }, 400, env);
    if (!viewer) return json({ error: "missing viewer" }, 400, env);

    const vid = await keyId(viewer);
    const balKey = `bal:${network}:${vid}`;
    const bal = Number((await env.PROMOTE.get(balKey)) || 0);
    if (bal < claimMin(env)) {
      return json({ ok: false, error: `Earn at least ${claimMin(env)} XRGE to claim.`, balance: bal }, 400, env);
    }
    // Simple claim lock to avoid a double-pay race.
    const lock = `claiming:${network}:${vid}`;
    if (await env.PROMOTE.get(lock)) return json({ ok: false, error: "claim in progress" }, 429, env);
    await env.PROMOTE.put(lock, "1", { expirationTtl: 60 });

    try {
      const address = await pubkeyToAddress(viewer);
      const { wallet } = await getPool(env);
      const rc = new RougeChain(nodeApi);
      // Zero the balance BEFORE paying so a failure can't be double-claimed; on a
      // send failure we restore it.
      await env.PROMOTE.put(balKey, "0");
      const res = (await rc.transfer(wallet, { to: address, amount: bal, fee: 1 })) as {
        success?: boolean;
        error?: string;
        data?: { txId?: string };
        txId?: string;
      };
      if (!res?.success) {
        await env.PROMOTE.put(balKey, String(bal)); // restore on failure
        await env.PROMOTE.delete(lock);
        return json({ ok: false, error: res?.error || "Payout failed. Try again." }, 502, env);
      }
      await env.PROMOTE.delete(lock);
      return json({ ok: true, claimed: bal, txId: res.txId ?? res.data?.txId ?? null }, 200, env);
    } catch (e) {
      await env.PROMOTE.put(balKey, String(bal)); // restore on error
      await env.PROMOTE.delete(lock);
      return json({ ok: false, error: `Payout failed: ${e instanceof Error ? e.message : String(e)}` }, 502, env);
    }
  }

  // ── End campaign: author-signed early stop (sets the ad to expired now) ──
  //
  // Auth is a wallet signature over a payload WE define, so it's unambiguous:
  // the signed message carries action:"promote:end" + postId, and we only act
  // if the signer's public key matches the ad's author. (This is the safe shape
  // the messenger read-signing lacked — there, read and delete payloads were
  // byte-identical; here the action + target are inside the signed bytes.)
  if (request.method === "POST" && url.pathname === "/end") {
    const { network, signedTx } = (await request.json().catch(() => ({}))) as {
      network?: string;
      signedTx?: SignedTransaction;
    };
    if (!network || !nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
    const r = await authedAd(env, network, signedTx, "promote:end");
    if (!r.ok) return json({ error: r.error }, r.status, env);
    r.ad.until = Date.now();
    await env.PROMOTE.put(r.key, JSON.stringify(r.ad));
    return json({ ok: true, ad: r.ad }, 200, env);
  }

  // ── Pause campaign: author-signed. Hides the ad from feeds and banks the
  //    remaining run-time so Resume restores the same window. ──
  if (request.method === "POST" && url.pathname === "/pause") {
    const { network, signedTx } = (await request.json().catch(() => ({}))) as {
      network?: string;
      signedTx?: SignedTransaction;
    };
    if (!network || !nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
    const r = await authedAd(env, network, signedTx, "promote:pause");
    if (!r.ok) return json({ error: r.error }, r.status, env);
    if (!r.ad.paused) {
      r.ad.remainingMs = Math.max(0, r.ad.until - Date.now());
      r.ad.paused = true;
      await env.PROMOTE.put(r.key, JSON.stringify(r.ad));
    }
    return json({ ok: true, ad: r.ad }, 200, env);
  }

  // ── Resume campaign: author-signed. Restores the banked remaining run-time. ──
  if (request.method === "POST" && url.pathname === "/resume") {
    const { network, signedTx } = (await request.json().catch(() => ({}))) as {
      network?: string;
      signedTx?: SignedTransaction;
    };
    if (!network || !nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
    const r = await authedAd(env, network, signedTx, "promote:resume");
    if (!r.ok) return json({ error: r.error }, r.status, env);
    if (r.ad.paused) {
      r.ad.until = Date.now() + (r.ad.remainingMs || 0);
      r.ad.paused = false;
      delete r.ad.remainingMs;
      await env.PROMOTE.put(r.key, JSON.stringify(r.ad));
    }
    return json({ ok: true, ad: r.ad }, 200, env);
  }

  return json({ error: "not found" }, 404, env);
}
