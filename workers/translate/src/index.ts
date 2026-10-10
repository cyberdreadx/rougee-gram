/**
 * RouGee translation — translate a post's text into the viewer's language.
 *
 *   POST /translate  {text, target}  ->  { text }
 *       Auto-detects the source language and translates `text` into `target`
 *       (a language name or ISO code). Uses Workers AI; results are cached in
 *       KV by (target, text-hash) so a popular post is only translated once.
 *
 * Captions/notes can be any language (the Nostr global feed is worldwide), so
 * an instruct model is used — it detects the source itself, no lang param.
 */
export interface Env {
  AI: Ai;
  TRANSLATE: KVNamespace;
  ALLOW_ORIGIN?: string;
}

const MODEL = "@cf/meta/llama-3.1-8b-instruct-fast";
const MAX_CHARS = 2000;
const TTL = 60 * 60 * 24 * 30; // 30 days

function cors(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
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

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Strip a wrapping pair of quotes the model sometimes adds.
function clean(s: string): string {
  const t = s.trim();
  if (t.length > 1 && /^["'"'].*["'"']$/.test(t)) return t.slice(1, -1).trim();
  return t;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });
    if (request.method !== "POST" || url.pathname !== "/translate") {
      return json({ error: "not found" }, 404, env);
    }

    const { text, target } = (await request.json().catch(() => ({}))) as {
      text?: string;
      target?: string;
    };
    const src = (text || "").trim();
    const tgt = (target || "").trim();
    if (!src || !tgt) return json({ error: "missing text or target" }, 400, env);
    if (src.length > MAX_CHARS) return json({ error: "text too long" }, 400, env);

    const key = `tr:${tgt}:${await sha256(src)}`;
    const cached = await env.TRANSLATE.get(key);
    if (cached !== null) return json({ text: cached, cached: true }, 200, env);

    try {
      const out = (await env.AI.run(MODEL, {
        messages: [
          {
            role: "system",
            content:
              `You are a translation engine. Translate the user's message into ${tgt}. ` +
              `Output ONLY the translated text — no quotes, no notes, no explanation, no preamble. ` +
              `Preserve @mentions, #hashtags, URLs and emoji unchanged. ` +
              `If the message is already in ${tgt}, output it unchanged.`,
          },
          { role: "user", content: src },
        ],
        max_tokens: 1024,
        temperature: 0.2,
      })) as { response?: string };

      const translated = clean(out.response || "");
      if (!translated) return json({ error: "empty translation" }, 502, env);
      await env.TRANSLATE.put(key, translated, { expirationTtl: TTL });
      return json({ text: translated }, 200, env);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : "translate failed" }, 502, env);
    }
  },
};
