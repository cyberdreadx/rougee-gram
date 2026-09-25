/**
 * RouGee story engagement — off-chain views + reactions for ephemeral stories.
 *
 *   POST /view    {network, storyId, viewer}          -> { ok }
 *   POST /react   {network, storyId, viewer, emoji|""} -> { ok }   ("" clears)
 *   GET  /story?network=<net>&storyId=<id>            -> { viewCount, views:[{viewer,at}],
 *                                                          reactions:[{from,emoji,at}] }
 *
 * Stories are on-chain social posts (kind:"story") but they're ephemeral (<24h)
 * and viewing/reacting must be free and silent — no per-view transaction or
 * wallet popup. So this lives off-chain: KV keyed by network+storyId+viewer,
 * with a TTL so it self-cleans after the story expires. The viewer id is the
 * caller's public key, self-reported (like Instagram, views aren't cryptographic
 * truth); low-stakes and display-only. Amounts/value are never involved.
 */

export interface Env {
  STORY: KVNamespace;
  ALLOW_ORIGIN?: string;
}

// Stories live <24h; keep engagement a bit longer so a just-expired story's
// author can still see who saw it, then let KV evict it.
const TTL_SECONDS = 60 * 60 * 48; // 48h
const NETWORKS = new Set(["testnet", "mainnet"]);
const MAX_EMOJI = 16;

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

interface StoredView {
  viewer: string;
  at: number;
}
interface StoredReaction {
  from: string;
  emoji: string;
  at: number;
}

async function readAll(
  env: Env,
  network: string,
  storyId: string,
): Promise<{
  viewCount: number;
  views: StoredView[];
  reactions: StoredReaction[];
}> {
  const vPrefix = `view:${network}:${storyId}:`;
  const rPrefix = `react:${network}:${storyId}:`;
  const [vList, rList] = await Promise.all([
    env.STORY.list({ prefix: vPrefix, limit: 1000 }),
    env.STORY.list({ prefix: rPrefix, limit: 1000 }),
  ]);
  const [vVals, rVals] = await Promise.all([
    Promise.all(vList.keys.map((k) => env.STORY.get(k.name, "json") as Promise<StoredView | null>)),
    Promise.all(
      rList.keys.map((k) => env.STORY.get(k.name, "json") as Promise<StoredReaction | null>),
    ),
  ]);
  const views = vVals.filter((v): v is StoredView => !!v).sort((a, b) => b.at - a.at);
  const reactions = rVals.filter((r): r is StoredReaction => !!r).sort((a, b) => b.at - a.at);
  return { viewCount: views.length, views, reactions };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    // ── Read: views + reactions for a story ──
    if (request.method === "GET" && url.pathname === "/story") {
      const network = url.searchParams.get("network") || "";
      const storyId = url.searchParams.get("storyId") || "";
      if (!NETWORKS.has(network)) return json({ error: "unsupported network" }, 400, env);
      if (!storyId) return json({ error: "missing storyId" }, 400, env);
      return json(await readAll(env, network, storyId), 200, env);
    }

    // ── Write: record a view ──
    if (request.method === "POST" && url.pathname === "/view") {
      const { network, storyId, viewer } = (await request.json().catch(() => ({}))) as {
        network?: string;
        storyId?: string;
        viewer?: string;
      };
      if (!network || !NETWORKS.has(network)) return json({ error: "unsupported network" }, 400, env);
      if (!storyId || !viewer) return json({ error: "missing storyId/viewer" }, 400, env);
      // One record per (story, viewer); keep the first-seen time.
      const key = `view:${network}:${storyId}:${viewer}`;
      if (!(await env.STORY.get(key))) {
        const v: StoredView = { viewer, at: Date.now() };
        await env.STORY.put(key, JSON.stringify(v), { expirationTtl: TTL_SECONDS });
      }
      return json({ ok: true }, 200, env);
    }

    // ── Write: set/clear a reaction (one per viewer) ──
    if (request.method === "POST" && url.pathname === "/react") {
      const { network, storyId, viewer, emoji } = (await request.json().catch(() => ({}))) as {
        network?: string;
        storyId?: string;
        viewer?: string;
        emoji?: string;
      };
      if (!network || !NETWORKS.has(network)) return json({ error: "unsupported network" }, 400, env);
      if (!storyId || !viewer) return json({ error: "missing storyId/viewer" }, 400, env);
      const key = `react:${network}:${storyId}:${viewer}`;
      const clean = (emoji ?? "").trim().slice(0, MAX_EMOJI);
      if (!clean) {
        await env.STORY.delete(key);
      } else {
        const r: StoredReaction = { from: viewer, emoji: clean, at: Date.now() };
        await env.STORY.put(key, JSON.stringify(r), { expirationTtl: TTL_SECONDS });
      }
      return json({ ok: true }, 200, env);
    }

    return json({ error: "not found" }, 404, env);
  },
};
