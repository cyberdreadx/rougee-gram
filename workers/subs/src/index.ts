/**
 * RouGee creator subscriptions + content gate.
 *
 * Model (mirrors the tips worker — the on-chain transfer IS the proof):
 *   • A creator sets a monthly price in their on-chain profile (`sub` field).
 *   • A fan transfers ≥ price XRGE to the creator, then POSTs {network, creator,
 *     txId}. We verify the transfer on-chain (recipient = creator, amount ≥ the
 *     creator's price, token = XRGE), read `from` = subscriber, and record a
 *     30-day subscription. One txId backs one subscription (idempotent).
 *   • Gated media lives in R2 under `gated/<creator>/<key>` and is served ONLY
 *     with a short-lived HMAC token, which is issued to a verified subscriber at
 *     subscribe time or via a signed /session (ML-DSA, re-issue on new devices).
 *
 * Endpoints:
 *   POST /subscribe  {network, creator, txId}          -> { ok, expiresAt, token }
 *   POST /session    {network, creator, signed:{payload,signature,public_key}} -> { token, expiresAt }
 *   GET  /status?network&creator&subscriber            -> { active, expiresAt }
 *   GET  /subscriptions?network&subscriber             -> { subscriptions:[{creator,expiresAt}] }
 *   POST /upload?network&creator&key&ext   body=bytes  -> { ref: "gate:<creator>/<key>.<ext>" }
 *   GET  /f/<creator>/<key>?t=<token>                  -> gated bytes (range-aware)
 */
import { RougeChain, pubkeyToAddress, verifyTransaction } from "@rougechain/sdk";

export interface Env {
  SUBS: KVNamespace;
  BUCKET: R2Bucket;
  NODE_TESTNET: string;
  NODE_MAINNET: string;
  ALLOW_ORIGIN?: string;
  /** HMAC secret for gate tokens — `wrangler secret put GATE_SECRET`. */
  GATE_SECRET: string;
}

const HEX = /^[0-9a-f]+$/i;
const SUB_DAYS = 30;
const TOKEN_TTL_MS = 30 * 60 * 1000; // gate token lives 30 min
const MAX_BYTES = 100 * 1024 * 1024;

function cors(env: Env, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": env.ALLOW_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Range",
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
function nodeFor(env: Env, network: string): string | null {
  if (network === "testnet") return env.NODE_TESTNET?.replace(/\/$/, "") || null;
  if (network === "mainnet") return env.NODE_MAINNET?.replace(/\/$/, "") || null;
  return null;
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
    const d = (await res.json()) as { success?: boolean; tx?: ChainTx };
    return d?.success && d.tx ? d.tx : null;
  } catch {
    return null;
  }
}
async function resolveToPubkey(nodeApi: string, input: string): Promise<string | null> {
  try {
    const res = await fetch(`${nodeApi}/resolve/${encodeURIComponent(input)}`);
    if (!res.ok) return null;
    const d = (await res.json()) as { publicKey?: string; public_key?: string };
    return d.publicKey || d.public_key || null;
  } catch {
    return null;
  }
}
/** Whether a transfer recipient (address or pubkey) is `creator` (both directions). */
async function recipientIs(nodeApi: string, recipient: string, creator: string): Promise<boolean> {
  if (recipient === creator) return true;
  const resolved = await resolveToPubkey(nodeApi, recipient);
  if (resolved && resolved === creator) return true;
  try {
    const addr = await pubkeyToAddress(creator);
    if (addr && addr.toLowerCase() === recipient.toLowerCase()) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** A creator's monthly price (XRGE) from their on-chain profile `sub` field. */
async function creatorPrice(nodeApi: string, creator: string): Promise<number | null> {
  try {
    const rc = new RougeChain(nodeApi);
    const { posts } = (await rc.social.getUserPosts(creator, 30, 0)) as {
      posts?: { body?: string }[];
    };
    for (const p of posts ?? []) {
      const b = (p.body ?? "").trim();
      if (!b.startsWith("{")) continue;
      try {
        const o = JSON.parse(b) as { v?: number; t?: string; sub?: number };
        if (o?.v === 1 && o?.t === "profile") {
          return typeof o.sub === "number" && o.sub > 0 ? o.sub : null;
        }
      } catch {
        /* not this one */
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

// ── Gate tokens: `<exp>.<hex HMAC(creator:exp)>` ──
async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function makeToken(env: Env, creator: string): Promise<{ token: string; exp: number }> {
  const exp = Date.now() + TOKEN_TTL_MS;
  const mac = await hmacHex(env.GATE_SECRET, `${creator}:${exp}`);
  return { token: `${exp}.${mac}`, exp };
}
async function tokenValid(env: Env, creator: string, token: string): Promise<boolean> {
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const exp = Number(token.slice(0, dot));
  const mac = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmacHex(env.GATE_SECRET, `${creator}:${exp}`);
  // constant-time-ish compare
  if (mac.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < mac.length; i++) diff |= mac.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

const subKey = (net: string, subscriber: string, creator: string) =>
  `sub:${net}:${subscriber}:${creator}`;

interface StoredSub {
  creator: string;
  subscriber: string;
  expiresAt: number;
  at: number;
}

async function activeSub(env: Env, net: string, subscriber: string, creator: string): Promise<StoredSub | null> {
  const s = (await env.SUBS.get(subKey(net, subscriber, creator), "json")) as StoredSub | null;
  return s && s.expiresAt > Date.now() ? s : null;
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
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(env) });

    // ── Subscribe (verified by the on-chain transfer) ──
    if (request.method === "POST" && url.pathname === "/subscribe") {
      const { network, creator, txId } = (await request.json().catch(() => ({}))) as {
        network?: string;
        creator?: string;
        txId?: string;
      };
      const nodeApi = network ? nodeFor(env, network) : null;
      if (!network || !nodeApi) return json({ error: "unsupported network" }, 400, env);
      if (!creator) return json({ error: "missing creator" }, 400, env);
      if (!txId || !HEX.test(txId)) return json({ error: "invalid txId" }, 400, env);

      const guard = `txused:${network}:${txId}`;
      if (await env.SUBS.get(guard)) {
        return json({ error: "transaction already used" }, 409, env);
      }
      const price = await creatorPrice(nodeApi, creator);
      if (price == null) return json({ error: "creator has no subscription price set" }, 400, env);

      const tx = await fetchTx(nodeApi, txId);
      if (!tx) return json({ error: "transaction not found on chain" }, 404, env);
      if (tx.tx_type !== "transfer") return json({ error: "not a transfer" }, 400, env);
      const amount = Number(tx.payload?.amount);
      const to = tx.payload?.to_pub_key_hex;
      const from = tx.from_pub_key;
      const token = tx.payload?.token_name ?? "XRGE";
      if (!(amount > 0) || !to || !from) return json({ error: "malformed transfer" }, 400, env);
      if (token !== "XRGE") return json({ error: "subscription must be paid in XRGE" }, 400, env);
      if (amount < price) return json({ error: `pays ${amount}, price is ${price}` }, 400, env);
      if (!(await recipientIs(nodeApi, to, creator))) {
        return json({ error: "payment recipient is not the creator" }, 400, env);
      }

      // Extend from the later of now / current expiry.
      const existing = await activeSub(env, network, from, creator);
      const basis = Math.max(Date.now(), existing?.expiresAt ?? 0);
      const expiresAt = basis + SUB_DAYS * 86_400_000;
      const stored: StoredSub = { creator, subscriber: from, expiresAt, at: Date.now() };
      await env.SUBS.put(subKey(network, from, creator), JSON.stringify(stored));
      await env.SUBS.put(guard, "1");

      const { token: gate } = await makeToken(env, creator);
      return json({ ok: true, expiresAt, token: gate }, 200, env);
    }

    // ── Re-issue a gate token for an existing subscriber (signed proof) ──
    if (request.method === "POST" && url.pathname === "/session") {
      const body = (await request.json().catch(() => ({}))) as {
        network?: string;
        creator?: string;
        signed?: { payload?: Record<string, unknown>; signature?: string; public_key?: string };
      };
      const { network, creator, signed } = body;
      if (!network || !nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
      if (!creator) return json({ error: "missing creator" }, 400, env);
      if (!signed?.payload || !signed.signature || !signed.public_key) {
        return json({ error: "missing signature" }, 400, env);
      }
      // The signed payload must name this creator and be recent (anti-replay).
      const ts = Number(signed.payload.timestamp);
      if ((signed.payload.creator as string) !== creator) return json({ error: "payload mismatch" }, 400, env);
      if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) {
        return json({ error: "stale request" }, 400, env);
      }
      let ok = false;
      try {
        ok = verifyTransaction(signed as never);
      } catch {
        ok = false;
      }
      if (!ok) return json({ error: "bad signature" }, 401, env);
      // The creator always sees their own gated content; others need a live sub.
      const entitled =
        signed.public_key === creator || !!(await activeSub(env, network, signed.public_key, creator));
      if (!entitled) return json({ error: "no active subscription" }, 403, env);
      const { token, exp } = await makeToken(env, creator);
      return json({ token, expiresAt: exp }, 200, env);
    }

    // ── Status: is <subscriber> subscribed to <creator>? ──
    if (request.method === "GET" && url.pathname === "/status") {
      const network = url.searchParams.get("network") || "";
      const creator = url.searchParams.get("creator") || "";
      const subscriber = url.searchParams.get("subscriber") || "";
      if (!nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
      if (!creator || !subscriber) return json({ error: "missing params" }, 400, env);
      const sub = await activeSub(env, network, subscriber, creator);
      return json({ active: !!sub, expiresAt: sub?.expiresAt ?? 0 }, 200, env);
    }

    // ── A user's active subscriptions ──
    if (request.method === "GET" && url.pathname === "/subscriptions") {
      const network = url.searchParams.get("network") || "";
      const subscriber = url.searchParams.get("subscriber") || "";
      if (!nodeFor(env, network)) return json({ error: "unsupported network" }, 400, env);
      if (!subscriber) return json({ error: "missing subscriber" }, 400, env);
      const list = await env.SUBS.list({ prefix: `sub:${network}:${subscriber}:`, limit: 1000 });
      const subs = await Promise.all(
        list.keys.map((k) => env.SUBS.get(k.name, "json") as Promise<StoredSub | null>),
      );
      const now = Date.now();
      const active = subs
        .filter((s): s is StoredSub => !!s && s.expiresAt > now)
        .map((s) => ({ creator: s.creator, expiresAt: s.expiresAt }))
        .sort((a, b) => b.expiresAt - a.expiresAt);
      return json({ subscriptions: active }, 200, env);
    }

    // ── Upload gated media (R2 under gated/<creator>/<key>.<ext>) ──
    if (request.method === "POST" && url.pathname === "/upload") {
      const creator = (url.searchParams.get("creator") || "").replace(/[^a-f0-9]/gi, "").slice(0, 4000);
      const key = (url.searchParams.get("key") || "").replace(/[^a-f0-9]/gi, "").slice(0, 64);
      const ext = (url.searchParams.get("ext") || "bin").replace(/[^a-z0-9]/gi, "").slice(0, 8);
      if (!creator || !key) return json({ error: "missing creator/key" }, 400, env);
      const contentType = request.headers.get("Content-Type") || "application/octet-stream";
      if (!/^(image|video)\//.test(contentType)) return json({ error: "unsupported type" }, 415, env);
      const len = Number(request.headers.get("Content-Length") || "0");
      if (len && len > MAX_BYTES) return json({ error: "file too large" }, 413, env);
      if (!request.body) return json({ error: "empty body" }, 400, env);
      const objectKey = `gated/${creator}/${key}.${ext}`;
      if (!(await env.BUCKET.head(objectKey))) {
        await env.BUCKET.put(objectKey, request.body, {
          httpMetadata: { contentType, cacheControl: "private, max-age=3600" },
        });
      }
      return json({ ref: `gate:${creator}/${key}.${ext}` }, 200, env);
    }

    // ── Serve gated media (requires a valid gate token for the creator) ──
    if (request.method === "GET" && url.pathname.startsWith("/f/")) {
      const rest = decodeURIComponent(url.pathname.slice(3)); // <creator>/<key>.<ext>
      const slash = rest.indexOf("/");
      if (slash < 0) return new Response("Not found", { status: 404, headers: cors(env) });
      const creator = rest.slice(0, slash);
      const token = url.searchParams.get("t") || "";
      if (!(await tokenValid(env, creator, token))) {
        return new Response("Forbidden", { status: 403, headers: cors(env) });
      }
      const objectKey = `gated/${rest}`;
      const rangeHeader = request.headers.get("Range");
      const range = rangeHeader ? parseRange(rangeHeader) : undefined;
      const obj = await env.BUCKET.get(objectKey, range ? { range } : undefined);
      if (!obj) return new Response("Not found", { status: 404, headers: cors(env) });
      const headers = new Headers(cors(env));
      obj.writeHttpMetadata(headers);
      headers.set("ETag", obj.httpEtag);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "private, max-age=3600");
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

    if (url.pathname === "/") return json({ ok: true, service: "rougee-subs" }, 200, env);
    return json({ error: "not found" }, 404, env);
  },
};
