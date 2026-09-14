/**
 * Password-based encryption for wallet secrets, mirroring the RougeChain wallet:
 * AES-256-GCM with a PBKDF2(SHA-256, 600k) derived key. The decrypted secret
 * lives only in memory; only ciphertext + iv + salt are persisted.
 */

const PBKDF2_ITERATIONS = 600_000;

function toBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** WebCrypto's BufferSource typing is stricter than Uint8Array<ArrayBufferLike>;
 *  this narrows without copying. */
function bs(u: Uint8Array): BufferSource {
  return u as unknown as BufferSource;
}

function bufToBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
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

async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    bs(toBytes(password)),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: bs(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export interface EncryptedBlob {
  ciphertext: string;
  iv: string;
  salt: string;
}

export async function encryptString(
  plaintext: string,
  password: string,
): Promise<EncryptedBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bs(iv) },
    key,
    bs(toBytes(plaintext)),
  );
  return {
    ciphertext: bufToBase64(cipher),
    iv: bufToBase64(iv),
    salt: bufToBase64(salt),
  };
}

export async function decryptString(
  blob: EncryptedBlob,
  password: string,
): Promise<string> {
  const salt = base64ToBytes(blob.salt);
  const iv = base64ToBytes(blob.iv);
  const key = await deriveKey(password, salt);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bs(iv) },
      key,
      bs(base64ToBytes(blob.ciphertext)),
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error("Incorrect password.");
  }
}
