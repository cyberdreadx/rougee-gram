/**
 * Creator subscriptions + content gate — client side of the subs Worker.
 *
 * The on-chain XRGE transfer is the proof of payment (like tips): the subscribe
 * flow transfers to the creator, then `recordSubscription` hands the txId to the
 * Worker, which verifies it on chain. Gated media is fetched from the Worker with
 * a short-lived HMAC token issued to a verified subscriber (cached locally; re-
 * issued via a signed /session when it expires).
 */
import { signRequest, type WalletKeys } from "@rougechain/sdk";
import { getConfig } from "./config";
import { sha256Hex } from "./media/hash";
import * as ext from "./extensionSigner";

export function subsEnabled(): boolean {
  return Boolean(getConfig().subsWorkerUrl);
}
function base(): string {
  return getConfig().subsWorkerUrl.replace(/\/+$/, "");
}
function net(): string {
  return getConfig().network;
}

export function isGatedRef(ref: string | undefined): boolean {
  return !!ref && ref.startsWith("gate:");
}
export function parseGateRef(ref: string): { creator: string; path: string } | null {
  if (!ref.startsWith("gate:")) return null;
  const path = ref.slice(5); // "<creator>/<key>.<ext>"
  const slash = path.indexOf("/");
  if (slash < 0) return null;
  return { creator: path.slice(0, slash), path };
}

function extFor(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("webp")) return "webp";
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("jpeg") || m.includes("jpg")) return "jpg";
  if (m.includes("mp4")) return "mp4";
  if (m.includes("webm")) return "webm";
  return "bin";
}

/** Upload gated media; returns a `gate:<creator>/<key>.<ext>` ref. */
export async function putGated(blob: Blob, creator: string): Promise<string> {
  if (!subsEnabled()) throw new Error("Subscriptions are not configured.");
  const key = await sha256Hex(blob);
  const mime = blob.type || "application/octet-stream";
  const res = await fetch(
    `${base()}/upload?network=${net()}&creator=${encodeURIComponent(creator)}&key=${key}&ext=${extFor(mime)}`,
    { method: "POST", headers: { "Content-Type": mime }, body: blob },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gated upload failed (${res.status}): ${t.slice(0, 160)}`);
  }
  const d = (await res.json()) as { ref?: string };
  if (!d.ref) throw new Error("Upload returned no ref.");
  return d.ref;
}

export interface SubStatus {
  active: boolean;
  expiresAt: number;
}
export async function getSubStatus(creator: string, subscriber: string): Promise<SubStatus> {
  if (!subsEnabled() || !creator || !subscriber) return { active: false, expiresAt: 0 };
  try {
    const res = await fetch(
      `${base()}/status?network=${net()}&creator=${encodeURIComponent(creator)}&subscriber=${encodeURIComponent(subscriber)}`,
    );
    if (!res.ok) return { active: false, expiresAt: 0 };
    const d = (await res.json()) as SubStatus;
    return { active: !!d.active, expiresAt: Number(d.expiresAt) || 0 };
  } catch {
    return { active: false, expiresAt: 0 };
  }
}

export interface MySub {
  creator: string;
  expiresAt: number;
}
export async function listSubscriptions(subscriber: string): Promise<MySub[]> {
  if (!subsEnabled() || !subscriber) return [];
  try {
    const res = await fetch(
      `${base()}/subscriptions?network=${net()}&subscriber=${encodeURIComponent(subscriber)}`,
    );
    if (!res.ok) return [];
    const d = (await res.json()) as { subscriptions?: MySub[] };
    return Array.isArray(d.subscriptions) ? d.subscriptions : [];
  } catch {
    return [];
  }
}

/** Record a verified subscription (call after the XRGE transfer lands). */
export async function recordSubscription(
  creator: string,
  txId: string,
): Promise<{ expiresAt: number; token: string }> {
  const res = await fetch(`${base()}/subscribe`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ network: net(), creator, txId }),
  });
  const d = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    expiresAt?: number;
    token?: string;
    error?: string;
  };
  if (!res.ok || !d.ok) throw new Error(d.error || `Subscription failed (${res.status})`);
  if (d.token) storeToken(creator, d.token);
  return { expiresAt: Number(d.expiresAt) || 0, token: d.token || "" };
}

// ── Gate tokens: short-lived, cached in localStorage per (network, creator) ──
const TOK_KEY = "rougee-gram:gatetok";
interface TokEntry {
  token: string;
  exp: number;
}
function readToks(): Record<string, TokEntry> {
  try {
    return JSON.parse(localStorage.getItem(TOK_KEY) || "{}") as Record<string, TokEntry>;
  } catch {
    return {};
  }
}
function storeToken(creator: string, token: string): void {
  const exp = Number(token.split(".")[0]) || 0;
  try {
    const all = readToks();
    all[`${net()}:${creator}`] = { token, exp };
    localStorage.setItem(TOK_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}
function cachedToken(creator: string): string | null {
  const e = readToks()[`${net()}:${creator}`];
  return e && e.exp > Date.now() + 10_000 ? e.token : null;
}

export interface Signer {
  wallet: WalletKeys | null;
  publicKey: string;
  isExtensionWallet: boolean;
}

/** A valid gate token for a creator — from cache, else a signed /session. */
export async function getGateToken(creator: string, signer: Signer): Promise<string | null> {
  const cached = cachedToken(creator);
  if (cached) return cached;
  try {
    const payload = { creator, timestamp: Date.now(), nonce: Math.random().toString(16).slice(2) };
    const signed = signer.isExtensionWallet
      ? await ext.signPayload(signer.publicKey, payload)
      : signer.wallet
        ? signRequest(signer.wallet, payload)
        : null;
    if (!signed) return null;
    const res = await fetch(`${base()}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ network: net(), creator, signed }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { token?: string };
    if (d.token) {
      storeToken(creator, d.token);
      return d.token;
    }
    return null;
  } catch {
    return null;
  }
}

export function gatedMediaUrl(ref: string, token: string): string | null {
  const p = parseGateRef(ref);
  if (!p) return null;
  return `${base()}/f/${p.path}?t=${encodeURIComponent(token)}`;
}
