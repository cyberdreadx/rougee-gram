/**
 * RouGee username directory — prefix search for @mentions.
 *
 *   POST /index   {network, handle}            -> { ok, handle, pubkey }
 *       Add/refresh a handle in the search index. VERIFIED: the Worker resolves
 *       the handle on-chain and only indexes it if it really exists, storing the
 *       owner's pubkey in the key's metadata. Entries expire after 90 days, so a
 *       released handle fades out (and re-indexing refreshes it).
 *
 *   GET  /search?network=<net>&q=<prefix>&limit=<n>  -> { results:[{handle,pubkey}] }
 *       Handles starting with <prefix> (KV list is lexicographic = prefix search).
 *
 * The node has no name enumeration, so the index is crowd-filled: every handle
 * the app registers or resolves is POSTed here (all re-verified on the way in).
 */
import { RougeChain } from "@rougechain/sdk";

export interface Env {
  DIRECTORY: KVNamespace;
  NODE_TESTNET: string;
  NODE_MAINNET: string;
  ALLOW_ORIGIN?: string;
}

const HANDLE = /^[a-z0-9_]{1,20}$/;
const TTL = 60 * 60 * 24 * 90; // 90 days

function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
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

/** Resolve a handle to its owner pubkey via the node, or null if unclaimed. */
async function resolveOwner(nodeApi: string, handle: string): Promise<string | null> {
  try {
    const r = (await new RougeChain(nodeApi).mail.resolveName(handle)) as {
      entry?: { wallet_id?: string };
      wallet?: { id?: string };
    } | null;
    return r?.entry?.wallet_id || r?.wallet?.id || null;
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    // ── Search by prefix ──
    if (request.method === "GET" && url.pathname === "/search") {
      const network = url.searchParams.get("network") || "";
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 8, 1), 20);
      if (!nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
      if (!HANDLE.test(q)) return json({ results: [] }, 200, env);
      const prefix = `name:${network}:`;
      const list = await env.DIRECTORY.list({ prefix: `${prefix}${q}`, limit });
      // Pubkeys are large (ML-DSA), so they're stored as values, not metadata —
      // fetch the matched few in parallel.
      const results = await Promise.all(
        list.keys.map(async (k) => ({
          handle: k.name.slice(prefix.length),
          pubkey: (await env.DIRECTORY.get(k.name)) || "",
        })),
      );
      return json({ results }, 200, env);
    }

    // ── Index a handle (verified on-chain) ──
    if (request.method === "POST" && url.pathname === "/index") {
      const { network, handle } = (await request.json().catch(() => ({}))) as {
        network?: string;
        handle?: string;
      };
      const nodeApi = nodeFor(env, network || "");
      const h = (handle || "").toLowerCase();
      if (!nodeApi) return json({ error: "unsupported network" }, 400, env);
      if (!HANDLE.test(h)) return json({ error: "invalid handle" }, 400, env);

      try {
        const owner = await resolveOwner(nodeApi, h);
        const pubkey = typeof owner === "string" ? owner : "";
        if (!pubkey) return json({ error: "handle not found" }, 404, env);
        await env.DIRECTORY.put(`name:${network}:${h}`, pubkey, { expirationTtl: TTL });
        return json({ ok: true, handle: h, pubkey }, 200, env);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 500, env);
      }
    }

    return json({ error: "not found" }, 404, env);
  },
};
