import { getConfig } from "./config";

/** Client calls to the RouGee HQ verification Worker. */

function base(): string {
  const url = getConfig().verifyWorkerUrl;
  if (!url) throw new Error("Verification isn't available yet.");
  return url.replace(/\/$/, "");
}

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error((data.error as string) || "Verification request failed.");
  return data;
}

/** Ask HQ to mail a one-time code to this account's on-chain mail. */
export async function startVerify(pubkey: string): Promise<void> {
  await post("/verify/start", { pubkey });
}

/** Confirm the code; the HQ attestation is signed AND stored server-side (an
 *  ML-DSA-65 signature is too big for the on-chain profile body). Returns it too. */
export async function confirmVerify(pubkey: string, code: string): Promise<string> {
  const data = await post("/verify/confirm", { pubkey, code });
  const sig = data.signature;
  if (typeof sig !== "string" || !sig) throw new Error("No attestation returned.");
  return sig;
}

/** Fetch an account's stored HQ attestation (hex), or null if not verified.
 *  Clients validate it locally against the HQ public key + live balance. */
export async function getAttestation(pubkey: string): Promise<string | null> {
  if (!pubkey || !getConfig().verifyWorkerUrl) return null;
  try {
    const res = await fetch(`${base()}/verify/attestation?pubkey=${encodeURIComponent(pubkey)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { vfy?: string | null };
    return typeof data.vfy === "string" ? data.vfy : null;
  } catch {
    return null;
  }
}
