/**
 * RouGee tips ledger — per-post tip attribution.
 *
 *   POST /tip   {network, postId, txId}   -> { ok, total, count }
 *       Records that on-chain transfer <txId> is a tip on <postId>. The tip is
 *       VERIFIED against the chain before it counts: we fetch the tx and the
 *       post, and only accept it when the transfer's recipient IS the post's
 *       author (so a tip can't be attributed to someone else's post) and it's a
 *       real XRGE transfer. One txId can back exactly one tip (idempotent).
 *
 *   GET  /tips?network=<net>&postId=<id>  -> { total, count, tippers:[{from,amount,at}] }
 *       Aggregate + the list of tippers (newest first) for a post.
 *
 * Attribution lives here (off-chain) rather than on-chain because a RougeChain
 * transfer carries no memo/post reference. Amounts and senders are still
 * chain-truth — we never trust a client-reported amount.
 */
import { RougeChain } from "@rougechain/sdk";

export interface Env {
  TIPS: KVNamespace;
  /** RougeChain node API bases (WITH /api), one per network the app follows. */
  NODE_TESTNET: string;
  NODE_MAINNET: string;
  ALLOW_ORIGIN?: string;
}

const HEX = /^[0-9a-f]+$/i;

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

/** Node API base for a network id, or null for unsupported (e.g. "custom"). */
function nodeFor(env: Env, network: string): string | null {
  if (network === "testnet") return env.NODE_TESTNET?.replace(/\/$/, "") || null;
  if (network === "mainnet") return env.NODE_MAINNET?.replace(/\/$/, "") || null;
  return null;
}

interface ChainTx {
  txType?: string;
  fromPubKey?: string;
  payload?: { toPubKeyHex?: string; amount?: number; token?: string };
  blockTime?: number;
}

/** Fetch a transaction by hash from the node (GET /api/tx/:hash). */
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

interface StoredTip {
  from: string;
  amount: number;
  at: number;
}

async function aggregate(
  env: Env,
  network: string,
  postId: string,
): Promise<{ total: number; count: number; tippers: StoredTip[] }> {
  const prefix = `tip:${network}:${postId}:`;
  const list = await env.TIPS.list({ prefix, limit: 1000 });
  const tips = await Promise.all(
    list.keys.map((k) => env.TIPS.get(k.name, "json") as Promise<StoredTip | null>),
  );
  const tippers = tips.filter((t): t is StoredTip => !!t).sort((a, b) => b.at - a.at);
  const total = tippers.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  return { total, count: tippers.length, tippers };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    // ── Read: aggregate + tippers for a post ──
    if (request.method === "GET" && url.pathname === "/tips") {
      const network = url.searchParams.get("network") || "";
      const postId = url.searchParams.get("postId") || "";
      if (!nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
      if (!postId) return json({ error: "missing postId" }, 400, env);
      return json(await aggregate(env, network, postId), 200, env);
    }

    // ── Write: record a verified tip ──
    if (request.method === "POST" && url.pathname === "/tip") {
      const { network, postId, txId } = (await request.json().catch(() => ({}))) as {
        network?: string;
        postId?: string;
        txId?: string;
      };
      if (!network) return json({ error: "unsupported network" }, 400, env);
      const nodeApi = nodeFor(env, network);
      if (!nodeApi) return json({ error: "unsupported network" }, 400, env);
      if (!postId) return json({ error: "missing postId" }, 400, env);
      if (!txId || !HEX.test(txId)) return json({ error: "invalid txId" }, 400, env);

      // One transaction can back exactly one tip, ever.
      const guardKey = `txused:${network}:${txId}`;
      if (await env.TIPS.get(guardKey)) {
        // Already recorded — return the current aggregate so the client is consistent.
        const agg = await aggregate(env, network, postId);
        return json({ ok: true, deduped: true, ...agg }, 200, env);
      }

      // Verify the transfer on-chain and confirm it went to THIS post's author.
      const tx = await fetchTx(nodeApi, txId);
      if (!tx) return json({ error: "transaction not found on chain" }, 404, env);
      if (tx.txType !== "transfer") return json({ error: "not a transfer" }, 400, env);
      const amount = Number(tx.payload?.amount);
      const to = tx.payload?.toPubKeyHex;
      const from = tx.fromPubKey;
      const token = tx.payload?.token ?? "XRGE";
      if (!(amount > 0) || !to || !from) return json({ error: "malformed transfer" }, 400, env);
      if (token !== "XRGE") return json({ error: "only XRGE tips are counted" }, 400, env);

      let authorPubkey: string | undefined;
      try {
        const rc = new RougeChain(nodeApi);
        const r = (await rc.social.getPost(postId)) as { post?: { author_pubkey?: string } };
        authorPubkey = r?.post?.author_pubkey;
      } catch {
        /* fall through to not-found */
      }
      if (!authorPubkey) return json({ error: "post not found" }, 404, env);
      if (authorPubkey !== to) {
        return json({ error: "transfer recipient is not the post's author" }, 400, env);
      }

      const tip: StoredTip = { from, amount, at: Number(tx.blockTime) || Date.now() };
      await env.TIPS.put(`tip:${network}:${postId}:${txId}`, JSON.stringify(tip));
      await env.TIPS.put(guardKey, postId);

      const agg = await aggregate(env, network, postId);
      return json({ ok: true, ...agg }, 200, env);
    }

    return json({ error: "not found" }, 404, env);
  },
};
