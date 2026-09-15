import { ml_kem768 } from "@noble/post-quantum/ml-kem.js";
import type { WalletKeys } from "@rougechain/sdk";

/**
 * Post-quantum E2E encryption for DMs (ML-KEM-768 + AES-256-GCM).
 *
 * Each user has an encryption keypair *derived deterministically from their
 * wallet* (recoverable from the seed/private key — nothing extra to back up).
 * Messages use a multi-recipient CEK scheme: content is encrypted once with a
 * random AES key (CEK); the CEK is KEM-wrapped for each participant. Only the
 * holders of the participants' secret keys can read it — the node never can.
 */

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
/** WebCrypto's BufferSource typing is stricter than Uint8Array<ArrayBufferLike>. */
function bs(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

export interface KemKeypair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
  publicKeyHex: string;
}

const cache = new Map<string, KemKeypair>();

/** Deterministically derive this wallet's ML-KEM-768 keypair (cached). */
export async function deriveKemKeypair(wallet: WalletKeys): Promise<KemKeypair> {
  const hit = cache.get(wallet.publicKey);
  if (hit) return hit;
  const src = new TextEncoder().encode(
    `${wallet.mnemonic || wallet.privateKey}|rougee-gram|kem-v1`,
  );
  const digest = await crypto.subtle.digest("SHA-512", src); // 64 bytes
  const seed = new Uint8Array(digest);
  const kp = ml_kem768.keygen(seed);
  const result: KemKeypair = {
    publicKey: kp.publicKey,
    secretKey: kp.secretKey,
    publicKeyHex: bytesToHex(kp.publicKey),
  };
  cache.set(wallet.publicKey, result);
  return result;
}

interface KeyEntry {
  kem: string; // KEM ciphertext (base64)
  wIv: string; // wrap IV (base64)
  wCek: string; // wrapped CEK (base64)
}
interface Envelope {
  v: 1;
  iv: string; // content IV (base64)
  data: string; // AES-GCM(content) (base64)
  keys: Record<string, KeyEntry>; // participantId -> wrapped CEK
}

export interface Recipient {
  id: string;
  kemPublicKeyHex: string;
}

/** Encrypt plaintext for all recipients (multi-recipient CEK). */
export async function encryptForRecipients(
  plaintext: string,
  recipients: Recipient[],
): Promise<string> {
  const cek = crypto.getRandomValues(new Uint8Array(32));
  const cekKey = await crypto.subtle.importKey("raw", bs(cek), "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dataBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bs(iv) },
    cekKey,
    bs(new TextEncoder().encode(plaintext)),
  );

  const keys: Record<string, KeyEntry> = {};
  for (const r of recipients) {
    const { cipherText, sharedSecret } = ml_kem768.encapsulate(
      hexToBytes(r.kemPublicKeyHex),
    );
    const wrapKey = await crypto.subtle.importKey(
      "raw",
      bs(sharedSecret),
      "AES-GCM",
      false,
      ["encrypt"],
    );
    const wIv = crypto.getRandomValues(new Uint8Array(12));
    const wCek = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: bs(wIv) },
      wrapKey,
      bs(cek),
    );
    keys[r.id] = {
      kem: bytesToBase64(cipherText),
      wIv: bytesToBase64(wIv),
      wCek: bytesToBase64(new Uint8Array(wCek)),
    };
  }

  const env: Envelope = { v: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(dataBuf)), keys };
  return JSON.stringify(env);
}

/** Decrypt an envelope addressed to `myId` using my KEM secret key. */
export async function decryptEnvelope(
  envStr: string,
  myId: string,
  mySecret: Uint8Array,
): Promise<string> {
  const env = JSON.parse(envStr) as Envelope;
  if (env.v !== 1 || !env.keys) throw new Error("bad envelope");
  const entry = env.keys[myId];
  if (!entry) throw new Error("not a recipient");

  const sharedSecret = ml_kem768.decapsulate(base64ToBytes(entry.kem), mySecret);
  const wrapKey = await crypto.subtle.importKey(
    "raw",
    bs(sharedSecret),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const cekBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bs(base64ToBytes(entry.wIv)) },
    wrapKey,
    bs(base64ToBytes(entry.wCek)),
  );
  const cekKey = await crypto.subtle.importKey(
    "raw",
    bs(new Uint8Array(cekBuf)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  const dataBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bs(base64ToBytes(env.iv)) },
    cekKey,
    bs(base64ToBytes(env.data)),
  );
  return new TextDecoder().decode(dataBuf);
}

/** Is this string one of our encrypted envelopes? */
export function isEnvelope(s: string): boolean {
  const t = (s || "").trim();
  if (!t.startsWith("{")) return false;
  try {
    const o = JSON.parse(t);
    return o && o.v === 1 && typeof o.data === "string" && o.keys;
  } catch {
    return false;
  }
}
