import type { ApiResponse } from "@rougechain/sdk";
import { rc } from "./rouge";
import * as ext from "./extensionSigner";
import type { Writer } from "./write";

/**
 * On-chain usernames (@handles) via RougeChain's native name registry — a
 * separate identity from the free-text profile display name. Unique, first-come,
 * bound to a wallet's public key. Local wallets sign via the SDK; provider
 * wallets (Qwalla) route through the extension signer.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
const USERNAME_RE = /^[a-z0-9_]+$/;

/** Normalize to the canonical stored form (the node resolves lowercase). */
export function normalizeUsername(name: string): string {
  return name.trim().toLowerCase().replace(/^@+/, "");
}

/** Returns an error string if invalid, else null. */
export function validateUsername(raw: string): string | null {
  const name = normalizeUsername(raw);
  if (name.length < USERNAME_MIN) return `At least ${USERNAME_MIN} characters.`;
  if (name.length > USERNAME_MAX) return `At most ${USERNAME_MAX} characters.`;
  if (!USERNAME_RE.test(name)) return "Only letters, numbers, and underscores.";
  return null;
}

/** The @handle owned by a public key, or null. */
export async function reverseUsername(pubkey: string): Promise<string | null> {
  if (!pubkey) return null;
  try {
    return await rc().mail.reverseLookup(pubkey);
  } catch {
    return null;
  }
}

/** Resolve a @handle to its owner (pubkey + address), or null if unclaimed. */
export async function resolveUsername(
  name: string,
): Promise<{ pubkey: string; walletId: string } | null> {
  const n = normalizeUsername(name);
  if (!n) return null;
  try {
    const r = await rc().mail.resolveName(n);
    const walletId = r?.entry?.wallet_id || r?.wallet?.id;
    return walletId ? { pubkey: walletId, walletId } : null;
  } catch {
    return null;
  }
}

/** True if the handle is unclaimed (available to register). */
export async function isUsernameAvailable(name: string): Promise<boolean> {
  return (await resolveUsername(name)) === null;
}

/** Claim a @handle for the signed-in wallet. */
export function registerUsername(w: Writer, name: string): Promise<ApiResponse> {
  const n = normalizeUsername(name);
  return w.isExtensionWallet
    ? ext.registerName(w.publicKey, n)
    : rc().mail.registerName(w.wallet!, n, w.publicKey);
}

/** Release a @handle you own. */
export function releaseUsername(w: Writer, name: string): Promise<ApiResponse> {
  const n = normalizeUsername(name);
  return w.isExtensionWallet
    ? ext.releaseName(w.publicKey, n)
    : rc().mail.releaseName(w.wallet!, n);
}
