import { ml_dsa65 } from "@noble/post-quantum/ml-dsa.js";

/**
 * RouGee verified "checks" — Hybrid model.
 *
 * A user is verified when BOTH hold:
 *  1. their profile carries a `vfy` attestation — an ML-DSA-65 signature by
 *     **RouGee HQ** over `verify:v1:<their pubkey>` (issued once, after they
 *     proved control of their on-chain mail via a one-time code), AND
 *  2. they currently hold ≥ VERIFY_MIN_XRGE (a live balance check at read time,
 *     so selling below the threshold silently drops the badge).
 *
 * Issuance (mail code + balance gate + signing) runs in the `rougee-verify`
 * Worker; reading is fully client-side/on-chain — the signature is verifiable
 * against HQ's public key baked in below, and the balance is on-chain.
 */

/**
 * RouGee HQ's ML-DSA-65 public key (hex). The Worker signs attestations with the
 * matching secret (held only as a Worker secret). REPLACE with the real HQ
 * pubkey after generating the HQ wallet — until then no attestation verifies.
 */
export const HQ_PUBLIC_KEY = "__ROUGEE_HQ_PUBLIC_KEY__";

/** Minimum XRGE a verified account must hold. */
export const VERIFY_MIN_XRGE = 50_000;

/** The exact message HQ signs for a given account. Domain-separated + versioned. */
export function verifyMessage(pubkey: string): string {
  return `verify:v1:${pubkey}`;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * True if `vfy` is a valid HQ signature over this pubkey's verify message.
 * A signature is bound to a specific pubkey, so it can't be copied into someone
 * else's profile. Balance is NOT checked here — see `useVerified`.
 */
export function isValidAttestation(pubkey: string, vfy: string | undefined): boolean {
  if (!vfy || !pubkey) return false;
  if (HQ_PUBLIC_KEY.startsWith("__")) return false; // HQ key not configured yet
  try {
    const msg = new TextEncoder().encode(verifyMessage(pubkey));
    return ml_dsa65.verify(hexToBytes(HQ_PUBLIC_KEY), msg, hexToBytes(vfy));
  } catch {
    return false;
  }
}
