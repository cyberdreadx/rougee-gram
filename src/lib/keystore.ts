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

interface SecretPayload {
  privateKey: string;
  mnemonic?: string;
}

export async function saveWallet(
  address: string,
  keys: WalletKeys,
  password: string,
): Promise<void> {
  const secret: SecretPayload = {
    privateKey: keys.privateKey,
    mnemonic: keys.mnemonic,
  };
  const enc = await encryptString(JSON.stringify(secret), password);
  const database = await db();
  await database.put("wallets", {
    address,
    publicKey: keys.publicKey,
    ciphertext: enc.ciphertext,
    iv: enc.iv,
    salt: enc.salt,
    createdAt: Date.now(),
  });
}

export async function listWallets(): Promise<StoredWalletMeta[]> {
  const database = await db();
  const all = await database.getAll("wallets");
  return all
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((w) => ({
      address: w.address,
      publicKey: w.publicKey,
      createdAt: w.createdAt,
    }));
}

export async function hasWallets(): Promise<boolean> {
  const database = await db();
  return (await database.count("wallets")) > 0;
}

export async function unlockWallet(
  address: string,
  password: string,
): Promise<WalletKeys> {
  const database = await db();
  const rec = await database.get("wallets", address);
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
}
