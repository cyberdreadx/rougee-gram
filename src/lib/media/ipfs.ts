import { getConfig, normalizeGateway } from "../config";
import type { PutResult } from "./types";

/**
 * IPFS media backend via Pinata. Requires a Pinata JWT (set in .env or Settings).
 * Reference form: `ipfs://<cid>`. Reads go through a public gateway.
 */

const PINATA_PIN_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";

export function ipfsEnabled(): boolean {
  return Boolean(getConfig().pinataJwt);
}

export async function putIpfs(blob: Blob, filename = "photo"): Promise<PutResult> {
  const { pinataJwt } = getConfig();
  if (!pinataJwt) throw new Error("No Pinata JWT configured for IPFS uploads.");

  const form = new FormData();
  form.append("file", blob, filename);
  form.append(
    "pinataMetadata",
    JSON.stringify({ name: `rougee-gram/${filename}` }),
  );

  const res = await fetch(PINATA_PIN_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${pinataJwt}` },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`IPFS upload failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { IpfsHash?: string };
  if (!json.IpfsHash) throw new Error("IPFS upload returned no CID.");

  return {
    ref: `ipfs://${json.IpfsHash}`,
    mime: blob.type || "application/octet-stream",
    size: blob.size,
  };
}

export function ipfsRefToUrl(ref: string): string {
  const cid = ref.replace(/^ipfs:\/\//, "");
  return `${normalizeGateway(getConfig().ipfsGateway)}${cid}`;
}

/** Verify a JWT works by hitting Pinata's auth-test endpoint. */
export async function testPinataJwt(jwt: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.pinata.cloud/data/testAuthentication", {
      headers: { Authorization: `Bearer ${jwt}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
