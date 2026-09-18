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

/** Confirm the code; returns the HQ attestation signature (hex) to store in the
 *  profile's `vfy` field. */
export async function confirmVerify(pubkey: string, code: string): Promise<string> {
  const data = await post("/verify/confirm", { pubkey, code });
  const sig = data.signature;
  if (typeof sig !== "string" || !sig) throw new Error("No attestation returned.");
  return sig;
}
