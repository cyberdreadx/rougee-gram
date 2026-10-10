/**
 * RouGee share counter — per-post share tally.
 *
 *   POST /share   {network, postId}            -> { count }
 *       Increments the share count for a post (called when a link is shared).
 *   GET  /shares?network=<net>&postId=<id>     -> { count }
 *       Current share count for a post.
 *
 * Sharing isn't an on-chain action, so this is an off-chain vanity counter
 * (like view counts) — intentionally lightweight, not fraud-proof.
 */
export interface Env {
  SHARES: KVNamespace;
  ALLOW_ORIGIN?: string;
}

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

const keyOf = (network: string, postId: string) => `shares:${network}:${postId}`;
const valid = (s: string) => Boolean(s) && s.length <= 200;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    if (request.method === "GET" && url.pathname === "/shares") {
      const network = url.searchParams.get("network") || "";
      const postId = url.searchParams.get("postId") || "";
      if (!valid(network) || !valid(postId)) return json({ error: "missing params" }, 400, env);
      const count = Number(await env.SHARES.get(keyOf(network, postId))) || 0;
      return json({ count }, 200, env);
    }

    if (request.method === "POST" && url.pathname === "/share") {
      const { network, postId } = (await request.json().catch(() => ({}))) as {
        network?: string;
        postId?: string;
      };
      if (!valid(network || "") || !valid(postId || "")) return json({ error: "missing params" }, 400, env);
      const k = keyOf(network as string, postId as string);
      const count = (Number(await env.SHARES.get(k)) || 0) + 1;
      await env.SHARES.put(k, String(count));
      return json({ count }, 200, env);
    }

    return json({ error: "not found" }, 404, env);
  },
};
