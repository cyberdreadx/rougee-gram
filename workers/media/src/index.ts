/**
 * rougee-gram media Worker — R2-backed upload + range-aware serving.
 *
 *   POST /upload?key=<sha256hex>&ext=<ext>   body = raw file bytes
 *        headers: Content-Type: image/* | video/*  [X-Upload-Secret if enabled]
 *        -> { url, key }   (url is https://<worker>/f/<objectKey>)
 *
 *   GET  /f/<objectKey>                       -> the file, with Range support
 *
 * Objects are content-addressed (key = client sha256), so re-uploads dedupe.
 */

export interface Env {
  BUCKET: R2Bucket;
  ALLOW_ORIGIN?: string;
  UPLOAD_SECRET?: string;
}

const MAX_BYTES = 100 * 1024 * 1024; // keep in sync with the app's VIDEO_MAX_BYTES

function cors(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Upload-Secret, Range",
    "Access-Control-Expose-Headers": "Content-Range, Content-Length, ETag, Accept-Ranges",
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

function parseRange(header: string): R2Range | undefined {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return undefined;
  const [, s, e] = m;
  if (s === "" && e === "") return undefined;
  if (s === "") return { suffix: Number(e) };
  const offset = Number(s);
  if (e === "") return { offset };
  return { offset, length: Number(e) - offset + 1 };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors(env) });
    }

    // ── Upload ────────────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/upload") {
      if (env.UPLOAD_SECRET && request.headers.get("X-Upload-Secret") !== env.UPLOAD_SECRET) {
        return json({ error: "unauthorized" }, 401, env);
      }
      const key = (url.searchParams.get("key") || "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
      const ext = (url.searchParams.get("ext") || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8);
      if (!key) return json({ error: "missing key" }, 400, env);

      const contentType = request.headers.get("Content-Type") || "application/octet-stream";
      if (!/^(image|video)\//.test(contentType)) {
        return json({ error: "unsupported content type" }, 415, env);
      }
      const len = Number(request.headers.get("Content-Length") || "0");
      if (len && len > MAX_BYTES) return json({ error: "file too large" }, 413, env);
      if (!request.body) return json({ error: "empty body" }, 400, env);

      const objectKey = `media/${key}.${ext}`;
      const existing = await env.BUCKET.head(objectKey);
      if (!existing) {
        await env.BUCKET.put(objectKey, request.body, {
          httpMetadata: {
            contentType,
            cacheControl: "public, max-age=31536000, immutable",
          },
        });
      }
      return json({ url: `${url.origin}/f/${objectKey}`, key: objectKey }, 200, env);
    }

    // ── Serve ─────────────────────────────────────────────────
    if (request.method === "GET" && url.pathname.startsWith("/f/")) {
      const objectKey = decodeURIComponent(url.pathname.slice(3));
      const rangeHeader = request.headers.get("Range");
      const range = rangeHeader ? parseRange(rangeHeader) : undefined;

      const obj = await env.BUCKET.get(objectKey, range ? { range } : undefined);
      if (!obj) return new Response("Not found", { status: 404, headers: cors(env) });

      const headers = new Headers(cors(env));
      obj.writeHttpMetadata(headers);
      headers.set("ETag", obj.httpEtag);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "public, max-age=31536000, immutable");

      if (range && obj.range) {
        const total = obj.size;
        const r = obj.range as { offset?: number; length?: number };
        const offset = r.offset ?? 0;
        const length = r.length ?? total - offset;
        headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${total}`);
        headers.set("Content-Length", String(length));
        return new Response(obj.body, { status: 206, headers });
      }
      return new Response(obj.body, { headers });
    }

    if (url.pathname === "/") {
      return json({ ok: true, service: "rougee-gram-media" }, 200, env);
    }
    return new Response("Not found", { status: 404, headers: cors(env) });
  },
};
