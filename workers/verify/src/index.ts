/**
 * RouGee HQ — verified-badge issuer.
 *
 *   GET  /verify/hq                 -> { publicKey }   (HQ signing pubkey; paste
 *                                       into src/lib/verify.ts once after deploy)
 *   POST /verify/start   {pubkey}   -> { ok }          (checks ≥MIN_XRGE, mails a
 *                                       one-time code to the user's on-chain mail)
 *   POST /verify/confirm {pubkey,code} -> { signature } (re-checks balance, signs
 *                                       verify:v1:<pubkey> with the HQ key)
 *
 * The client stores `signature` in its profile envelope (`vfy`) and re-checks the
 * balance at render time, so the badge is self-verifying and auto-revokes if the
 * holder drops below the threshold.
 */
import { RougeChain, Wallet, bytesToHex, hexToBytes } from "@rougechain/sdk";
import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";
import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";

export interface Env {
  VERIFY_CODES: KVNamespace;
  ROUGE_API: string;
  ALLOW_ORIGIN?: string;
  MIN_XRGE?: string;
  /** HQ wallet recovery phrase (secret). */
  HQ_MNEMONIC: string;
}

const CODE_TTL = 900; // 15 min
const RESEND_COOLDOWN = 60; // seconds between code sends per account
const MAX_ATTEMPTS = 5;
// RougeChain ML-DSA-65 public keys are long hex (1952 bytes = 3904 hex chars),
// NOT a 64-char hash — validate as even-length hex with a sane minimum.
const HEX_PUBKEY = /^[0-9a-f]+$/i;
const isPubkey = (pk?: string): pk is string =>
  !!pk && pk.length >= 64 && pk.length % 2 === 0 && HEX_PUBKEY.test(pk);

// RougeChain pubkeys are ~3904 hex chars — far over Cloudflare KV's 512-byte key
// limit. Hash to a short, stable id for KV keys.
async function keyId(pubkey: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pubkey));
  return bytesToHex(new Uint8Array(buf));
}

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

function minXrge(env: Env): number {
  const n = Number(env.MIN_XRGE);
  return Number.isFinite(n) && n > 0 ? n : 50_000;
}

/** Cache the HQ wallet across requests within an isolate. */
let hqWallet: Wallet | null = null;
function getHq(env: Env): Wallet {
  if (!hqWallet) hqWallet = Wallet.fromMnemonic(env.HQ_MNEMONIC.trim());
  return hqWallet;
}

async function balanceOf(env: Env, pubkey: string): Promise<number> {
  const rc = new RougeChain(env.ROUGE_API);
  try {
    const res = (await rc.getBalance(pubkey)) as { balance?: number };
    return typeof res.balance === "number" ? res.balance : 0;
  } catch {
    return 0;
  }
}

/** Look up a recipient's registered mail encryption public key (hex). */
async function recipientEncKey(env: Env, pubkey: string): Promise<string | null> {
  const rc = new RougeChain(env.ROUGE_API);
  const list = (await rc.messenger.getWallets().catch(() => [])) as Record<string, string>[];
  for (const w of list) {
    if ([w.id, w.publicKey, w.signing_public_key, w.signingPublicKey].includes(pubkey)) {
      return w.encryption_public_key || w.encryptionPublicKey || null;
    }
  }
  return null;
}

// ── Qwalla-compatible V2 mail encryption (ML-KEM-768 + HKDF-SHA256 + AES-GCM) ──
// Matches Qwalla lib/encryption.ts `encryptMailV2` so the code is readable in the
// recipient's Qwalla mail inbox. Uses WebCrypto (available in Workers).
const WRAP_INFO = new TextEncoder().encode("pqc-cek-wrap");
const ZERO32 = new Uint8Array(32);

async function aesGcm(keyBytes: Uint8Array, plaintext: Uint8Array): Promise<{ iv: string; ct: string }> {
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  return { iv: bytesToHex(iv), ct: bytesToHex(ct) };
}

async function hkdf32(sharedSecret: Uint8Array): Promise<Uint8Array> {
  const ikm = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: ZERO32, info: WRAP_INFO },
    ikm,
    256,
  );
  return new Uint8Array(bits);
}

async function encryptMailV2(plaintext: string, recipientEncPubHex: string): Promise<string> {
  const cek = crypto.getRandomValues(new Uint8Array(32));
  const content = await aesGcm(cek, new TextEncoder().encode(plaintext));
  const { cipherText, sharedSecret } = ml_kem768.encapsulate(hexToBytes(recipientEncPubHex));
  const wrapKey = await hkdf32(sharedSecret);
  const wrapped = await aesGcm(wrapKey, cek);
  return JSON.stringify({
    version: 2,
    iv: content.iv,
    encryptedContent: content.ct,
    wrappedKeys: {
      [recipientEncPubHex]: {
        kemCipherText: bytesToHex(cipherText),
        wrappedCek: wrapped.ct,
        wrappedIv: wrapped.iv,
      },
    },
  });
}

function sixDigitCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return String(buf[0] % 1_000_000).padStart(6, "0");
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Wrap everything so ANY unhandled error still returns a CORS-bearing JSON
    // response. Without this, a thrown exception yields a 500 with no CORS
    // headers, which the browser reports opaquely as "Load failed".
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

    // ── HQ public key (setup helper) ──
    if (request.method === "GET" && url.pathname === "/verify/hq") {
      try {
        return json({ publicKey: getHq(env).publicKey }, 200, env);
      } catch {
        return json({ error: "HQ wallet not configured" }, 500, env);
      }
    }

    // ── Attestation lookup (unsigned read; clients validate it locally) ──
    if (request.method === "GET" && url.pathname === "/verify/attestation") {
      const pubkey = url.searchParams.get("pubkey") || "";
      if (!isPubkey(pubkey)) return json({ error: "invalid pubkey" }, 400, env);
      const vfy = await env.VERIFY_CODES.get(`vfy:${await keyId(pubkey)}`);
      return json({ vfy: vfy || null }, 200, env);
    }

    // ── Start: mail a one-time code ──
    if (request.method === "POST" && url.pathname === "/verify/start") {
      const { pubkey } = (await request.json().catch(() => ({}))) as { pubkey?: string };
      if (!isPubkey(pubkey)) return json({ error: "invalid pubkey" }, 400, env);

      const min = minXrge(env);
      if ((await balanceOf(env, pubkey)) < min) {
        return json({ error: `Hold at least ${min.toLocaleString()} XRGE to verify.` }, 403, env);
      }

      const id = await keyId(pubkey);

      // Rate-limit resends.
      if (await env.VERIFY_CODES.get(`sent:${id}`)) {
        return json({ error: "A code was just sent — check your mail and wait a minute." }, 429, env);
      }

      const recipEnc = await recipientEncKey(env, pubkey);
      if (!recipEnc) {
        return json(
          { error: "Open Qwalla mail once to enable receiving mail, then try again." },
          400,
          env,
        );
      }

      const code = sixDigitCode();
      await env.VERIFY_CODES.put(`code:${id}`, JSON.stringify({ code, attempts: 0 }), {
        expirationTtl: CODE_TTL,
      });
      await env.VERIFY_CODES.put(`sent:${id}`, "1", { expirationTtl: RESEND_COOLDOWN });

      try {
        const hq = getHq(env);
        const rc = new RougeChain(env.ROUGE_API);
        const subjectEnc = await encryptMailV2("RouGee verification code", recipEnc);
        const bodyEnc = await encryptMailV2(
          `Your RouGee verification code is ${code}.\n\n` +
            `Enter it in RouGee → Settings → Get verified. It expires in 15 minutes. ` +
            `If you didn't request this, ignore this message.`,
          recipEnc,
        );
        const sent = (await rc.mail.send(hq, {
          from: hq.publicKey,
          to: pubkey,
          encrypted_subject: subjectEnc,
          encrypted_body: bodyEnc,
        })) as { success?: boolean; error?: string };
        // mail.send RESOLVES on a node-level failure (doesn't throw), so we must
        // check success — otherwise a failed send is reported as ok.
        if (!sent?.success) {
          // Let them retry immediately — the code was never delivered.
          await env.VERIFY_CODES.delete(`sent:${id}`);
          return json(
            { error: `Could not send the code to your mail: ${sent?.error || "unknown error"}` },
            502,
            env,
          );
        }
      } catch (e) {
        await env.VERIFY_CODES.delete(`sent:${id}`);
        return json(
          { error: `Could not send the code to your mail: ${e instanceof Error ? e.message : String(e)}` },
          502,
          env,
        );
      }

      return json({ ok: true }, 200, env);
    }

    // ── Confirm: validate code + balance, issue the attestation ──
    if (request.method === "POST" && url.pathname === "/verify/confirm") {
      const { pubkey, code } = (await request.json().catch(() => ({}))) as {
        pubkey?: string;
        code?: string;
      };
      if (!isPubkey(pubkey)) return json({ error: "invalid pubkey" }, 400, env);
      if (!code || !/^\d{6}$/.test(code)) return json({ error: "invalid code" }, 400, env);

      const id = await keyId(pubkey);
      const raw = await env.VERIFY_CODES.get(`code:${id}`);
      if (!raw) return json({ error: "No pending code — request a new one." }, 400, env);
      const entry = JSON.parse(raw) as { code: string; attempts: number };

      if (entry.attempts >= MAX_ATTEMPTS) {
        await env.VERIFY_CODES.delete(`code:${id}`);
        return json({ error: "Too many attempts — request a new code." }, 429, env);
      }

      if (entry.code !== code) {
        await env.VERIFY_CODES.put(
          `code:${id}`,
          JSON.stringify({ code: entry.code, attempts: entry.attempts + 1 }),
          { expirationTtl: CODE_TTL },
        );
        return json({ error: "Wrong code." }, 400, env);
      }

      // Re-check balance at issuance (they must still hold the minimum).
      const min = minXrge(env);
      if ((await balanceOf(env, pubkey)) < min) {
        return json({ error: `Hold at least ${min.toLocaleString()} XRGE to verify.` }, 403, env);
      }

      let signature: string;
      try {
        const hq = getHq(env);
        const msg = new TextEncoder().encode(`verify:v1:${pubkey}`);
        signature = bytesToHex(ml_dsa65.sign(msg, hexToBytes(hq.privateKey)));
      } catch {
        return json({ error: "Signing failed." }, 500, env);
      }

      await env.VERIFY_CODES.delete(`code:${id}`);
      // Persist the attestation server-side. It can't live in the profile — an
      // ML-DSA-65 signature is ~6600 hex chars, over the 4000-char post-body
      // limit — so clients read it from here and validate it locally against the
      // HQ public key + live balance (auto-revoke still applies).
      await env.VERIFY_CODES.put(`vfy:${id}`, signature);
      return json({ signature }, 200, env);
    }

    return json({ error: "not found" }, 404, env);
}
