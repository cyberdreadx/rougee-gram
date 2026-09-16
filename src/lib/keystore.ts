import type { WalletKeys } from "@rougechain/sdk";
import { db } from "./db";
import { encryptString, decryptString } from "./crypto";

/**
 * Persistent, password-encrypted wallet storage. Only ciphertext is written to
 * disk (IndexedDB). Unlocking returns the in-memory WalletKeys.
 */

export interface StoredWalletMeta {
  address: string;
  publicKey: string;
  createdAt: number;
}

/**
 * Ask the browser to mark this origin's storage as persistent so the encrypted
 * wallet (IndexedDB) isn't auto-evicted under storage pressure — the usual
 * reason a returning user lands back on onboarding instead of the password
 * unlock screen. Best-effort; some browsers/webviews may decline.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

interface SecretPayload {
  privateKey: string;
  mnemonic?: string;
}

/** Encrypted wallet record — only ciphertext is stored (safe at rest). */
interface WalletRecord {
  address: string;
  publicKey: string;
  ciphertext: string;
  iv: string;
  salt: string;
  createdAt: number;
}

// Belt-and-suspenders: mirror the encrypted record to localStorage too. IndexedDB
// and localStorage are evicted independently on mobile/in-app browsers, so keeping
// the wallet in both (and self-healing one from the other) sharply cuts the odds a
// returning user is bounced back to onboarding. Ciphertext only — same security.
const LS_PREFIX = "rougee-gram:wallet:";

function lsSave(rec: WalletRecord): void {
  try {
    localStorage.setItem(LS_PREFIX + rec.address, JSON.stringify(rec));
  } catch {
    /* storage full/unavailable */
  }
}
function lsGet(address: string): WalletRecord | null {
  try {
    const v = localStorage.getItem(LS_PREFIX + address);
    return v ? (JSON.parse(v) as WalletRecord) : null;
  } catch {
    return null;
  }
}
function lsGetAll(): WalletRecord[] {
  const out: WalletRecord[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) {
        const v = localStorage.getItem(k);
        if (v) {
          try {
            out.push(JSON.parse(v) as WalletRecord);
          } catch {
            /* skip corrupt entry */
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}
function lsDelete(address: string): void {
  try {
    localStorage.removeItem(LS_PREFIX + address);
  } catch {
    /* ignore */
  }
}

export async function saveWallet(
  address: string,
  keys: WalletKeys,
  password: string,
): Promise<void> {
  // Request persistence up-front (still within the create/unlock user gesture,
  // which some browsers require to grant it) before the wallet is written.
  void requestPersistentStorage();
  const secret: SecretPayload = {
    privateKey: keys.privateKey,
    mnemonic: keys.mnemonic,
  };
  const enc = await encryptString(JSON.stringify(secret), password);
  const record: WalletRecord = {
    address,
    publicKey: keys.publicKey,
    ciphertext: enc.ciphertext,
    iv: enc.iv,
    salt: enc.salt,
    createdAt: Date.now(),
  };
  const database = await db();
  await database.put("wallets", record);
  lsSave(record); // mirror to localStorage
}

export async function listWallets(): Promise<StoredWalletMeta[]> {
  const database = await db();
  const idb = (await database.getAll("wallets")) as WalletRecord[];
  const ls = lsGetAll();

  // Self-heal: rewrite any localStorage-only wallet back into IndexedDB (and vice
  // versa) so an eviction of one store doesn't lose the account.
  const idbAddrs = new Set(idb.map((w) => w.address));
  for (const rec of ls) {
    if (!idbAddrs.has(rec.address)) {
      try {
        await database.put("wallets", rec);
      } catch {
        /* ignore */
      }
    }
  }
  for (const rec of idb) if (!lsGet(rec.address)) lsSave(rec);

  const byAddr = new Map<string, WalletRecord>();
  for (const r of ls) byAddr.set(r.address, r);
  for (const r of idb) byAddr.set(r.address, r); // IDB wins on conflict
  return [...byAddr.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((w) => ({ address: w.address, publicKey: w.publicKey, createdAt: w.createdAt }));
}

export async function hasWallets(): Promise<boolean> {
  return (await listWallets()).length > 0;
}

export async function unlockWallet(
  address: string,
  password: string,
): Promise<WalletKeys> {
  const database = await db();
  const rec = ((await database.get("wallets", address)) as WalletRecord | undefined) ?? lsGet(address);
  if (!rec) throw new Error("Wallet not found on this device.");
  const json = await decryptString(
    { ciphertext: rec.ciphertext, iv: rec.iv, salt: rec.salt },
    password,
  );
  const secret = JSON.parse(json) as SecretPayload;
  return {
    publicKey: rec.publicKey,
    privateKey: secret.privateKey,
    mnemonic: secret.mnemonic,
  };
}

export async function deleteWallet(address: string): Promise<void> {
  const database = await db();
  await database.delete("wallets", address);
  lsDelete(address);
}
