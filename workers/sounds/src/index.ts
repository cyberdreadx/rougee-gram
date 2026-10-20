/**
 * RouGee sounds — discovery index for reels that use a qRougee music track.
 *
 *   POST /use  {network, postId, soundId}  -> { recorded: boolean }
 *       Records that <postId> is a reel using <soundId>. VERIFIED on-chain: the
 *       Worker fetches the post and only records it when its envelope actually
 *       carries that track (`audio.id === soundId`), so a use can't be faked.
 *       The author + timestamp are read from the post (chain-truth).
 *
 *   GET  /sound?network=<net>&soundId=<id>  -> { soundId, title, artist, count, reels:[{postId,from,at}] }
 *       Reels using a track, newest first.
 *
 *   GET  /trending?network=<net>&limit=<n>  -> { sounds:[{soundId,title,artist,count,lastAt}] }
 *       Most-used tracks, by use count then recency.
 *
 * On-chain posts carry no sound index, so it lives off-chain here.
 */
import { RougeChain } from "@rougechain/sdk";

export interface Env {
  SOUNDS: KVNamespace;
  NODE_TESTNET: string;
  NODE_MAINNET: string;
  ALLOW_ORIGIN?: string;
}

const SOUND_ID = /^[A-Za-z0-9_-]{3,128}$/;

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

interface UseRecord {
  postId: string;
  from: string;
  at: number;
}
interface SoundAgg {
  soundId: string;
  title: string;
  artist: string;
  count: number;
  lastAt: number;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    // ── Read: reels using a track ──
    if (request.method === "GET" && url.pathname === "/sound") {
      const network = url.searchParams.get("network") || "";
      const soundId = url.searchParams.get("soundId") || "";
      if (!nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
      if (!SOUND_ID.test(soundId)) return json({ error: "invalid soundId" }, 400, env);
      const list = await env.SOUNDS.list({ prefix: `use:${network}:${soundId}:`, limit: 300 });
      const items = await Promise.all(
        list.keys.map((k) => env.SOUNDS.get(k.name, "json") as Promise<UseRecord | null>),
      );
      const reels = items.filter((r): r is UseRecord => !!r).sort((a, b) => b.at - a.at);
      const agg = (await env.SOUNDS.get(`snd:${network}:${soundId}`, "json")) as SoundAgg | null;
      return json(
        {
          soundId,
          title: agg?.title || "",
          artist: agg?.artist || "",
          count: agg?.count ?? reels.length,
          reels,
        },
        200,
        env,
      );
    }

    // ── Read: trending tracks ──
    if (request.method === "GET" && url.pathname === "/trending") {
      const network = url.searchParams.get("network") || "";
      const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 20));
      if (!nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
      const list = await env.SOUNDS.list({ prefix: `snd:${network}:`, limit: 1000 });
      const items = await Promise.all(
        list.keys.map((k) => env.SOUNDS.get(k.name, "json") as Promise<SoundAgg | null>),
      );
      const sounds = items
        .filter((s): s is SoundAgg => !!s)
        .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
        .slice(0, limit);
      return json({ sounds }, 200, env);
    }

    // ── Write: record a verified sound use ──
    if (request.method === "POST" && url.pathname === "/use") {
      const { network, postId, soundId } = (await request.json().catch(() => ({}))) as {
        network?: string;
        postId?: string;
        soundId?: string;
      };
      const nodeApi = nodeFor(env, network || "");
      if (!nodeApi) return json({ error: "unsupported network" }, 400, env);
      if (!postId) return json({ error: "missing postId" }, 400, env);
      if (!soundId || !SOUND_ID.test(soundId)) return json({ error: "invalid soundId" }, 400, env);

      // Verify against the chain: the post must carry this exact track.
      let from = "";
      let at = Date.now();
      let title = "";
      let artist = "";
      try {
        const rc = new RougeChain(nodeApi);
        const r = (await rc.social.getPost(postId)) as {
          post?: { author_pubkey?: string; body?: string; created_at?: string };
        };
        if (!r?.post) return json({ error: "post not found" }, 404, env);
        const env0 = JSON.parse(r.post.body || "{}") as {
          t?: string;
          audio?: { id?: string; title?: string; artist?: string };
        };
        if ((env0.t !== "video" && env0.t !== "reel") || env0.audio?.id !== soundId) {
          return json({ error: "post does not use this sound" }, 409, env);
        }
        from = r.post.author_pubkey || "";
        title = env0.audio?.title || "";
        artist = env0.audio?.artist || "";
        const ts = Date.parse(r.post.created_at || "");
        if (!Number.isNaN(ts)) at = ts;
      } catch {
        return json({ error: "post not found" }, 404, env);
      }

      const useKey = `use:${network}:${soundId}:${postId}`;
      const existed = await env.SOUNDS.get(useKey);
      const rec: UseRecord = { postId, from, at };
      await env.SOUNDS.put(useKey, JSON.stringify(rec));

      // Upsert the per-sound aggregate used for /trending.
      const aggKey = `snd:${network}:${soundId}`;
      const prev = (await env.SOUNDS.get(aggKey, "json")) as SoundAgg | null;
      const agg: SoundAgg = {
        soundId,
        title: title || prev?.title || "",
        artist: artist || prev?.artist || "",
        count: (prev?.count || 0) + (existed ? 0 : 1),
        lastAt: Math.max(prev?.lastAt || 0, at),
      };
      await env.SOUNDS.put(aggKey, JSON.stringify(agg));

      return json({ recorded: true }, 200, env);
    }

    return json({ error: "not found" }, 404, env);
  },
};
