/**
 * RouGee mentions — "@handle mentioned you" notifications.
 *
 *   POST /mention  {network, postId, handles:[...]}  -> { recorded:[...] }
 *       Records that <postId> mentions each handle. VERIFIED on-chain: the
 *       Worker fetches the post and only records a handle that actually appears
 *       as @handle in the post body, so nobody can fake a mention for someone.
 *       The mentioner is read from the post's author (chain-truth).
 *
 *   GET  /mentions?network=<net>&handle=<h>  -> { mentions:[{postId,from,at}] }
 *       Posts that mention <handle>, newest first.
 *
 * On-chain posts carry no mention index, so it lives off-chain here.
 */
import { RougeChain } from "@rougechain/sdk";

export interface Env {
  MENTIONS: KVNamespace;
  NODE_TESTNET: string;
  NODE_MAINNET: string;
  ALLOW_ORIGIN?: string;
}

const HANDLE = /^[a-z0-9_]{3,20}$/;

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

/** True if @handle appears in the text as a whole token. */
function bodyMentions(body: string, handle: string): boolean {
  return new RegExp(`@${handle}(?![a-z0-9_])`, "i").test(body);
}

interface StoredMention {
  postId: string;
  from: string;
  at: number;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    // ── Read: posts that mention a handle ──
    if (request.method === "GET" && url.pathname === "/mentions") {
      const network = url.searchParams.get("network") || "";
      const handle = (url.searchParams.get("handle") || "").toLowerCase();
      if (!nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
      if (!HANDLE.test(handle)) return json({ error: "invalid handle" }, 400, env);
      const list = await env.MENTIONS.list({ prefix: `mn:${network}:${handle}:`, limit: 200 });
      const items = await Promise.all(
        list.keys.map((k) => env.MENTIONS.get(k.name, "json") as Promise<StoredMention | null>),
      );
      const mentions = items
        .filter((m): m is StoredMention => !!m)
        .sort((a, b) => b.at - a.at);
      return json({ mentions }, 200, env);
    }

    // ── Write: record verified mentions for a post ──
    if (request.method === "POST" && url.pathname === "/mention") {
      const { network, postId, handles } = (await request.json().catch(() => ({}))) as {
        network?: string;
        postId?: string;
        handles?: string[];
      };
      const nodeApi = nodeFor(env, network || "");
      if (!nodeApi) return json({ error: "unsupported network" }, 400, env);
      if (!postId) return json({ error: "missing postId" }, 400, env);
      const wanted = [...new Set((handles || []).map((h) => h.toLowerCase()))].filter((h) =>
        HANDLE.test(h),
      );
      if (!wanted.length) return json({ recorded: [] }, 200, env);

      // Verify against the chain: fetch the post, read its author + body.
      let body = "";
      let from = "";
      let at = Date.now();
      try {
        const rc = new RougeChain(nodeApi);
        const r = (await rc.social.getPost(postId)) as {
          post?: { author_pubkey?: string; body?: string; created_at?: string };
        };
        if (!r?.post) return json({ error: "post not found" }, 404, env);
        body = r.post.body || "";
        from = r.post.author_pubkey || "";
        const ts = Date.parse(r.post.created_at || "");
        if (!Number.isNaN(ts)) at = ts;
      } catch {
        return json({ error: "post not found" }, 404, env);
      }

      const recorded: string[] = [];
      for (const handle of wanted) {
        if (!bodyMentions(body, handle)) continue; // not actually mentioned — skip
        const rec: StoredMention = { postId, from, at };
        await env.MENTIONS.put(`mn:${network}:${handle}:${postId}`, JSON.stringify(rec));
        recorded.push(handle);
      }
      return json({ recorded }, 200, env);
    }

    return json({ error: "not found" }, 404, env);
  },
};
