import type { WalletKeys } from "@rougechain/sdk";
import { getPublicKey } from "nostr-tools";
import { hexToBytes } from "nostr-tools/utils";
import { deriveKemKeypair, encryptForRecipients, decryptEnvelope } from "@/lib/pqc";
import * as extSigner from "@/lib/extensionSigner";
import { getExtension, loadOrCreateSecretKey, importLocalKey } from "@/lib/nostrAuth";
import { getProfile } from "@/lib/profile";

/**
 * Encrypted Nostr-key backup, stored in the RougeChain profile.
 *
 * Each account's Nostr key is generated in the browser and isn't part of the
 * recovery phrase, so clearing browser data or switching devices used to lose
 * it. Now the key is sealed with the account's own ML-KEM-768 key (the same
 * post-quantum key DMs use — derived from the recovery phrase, or held by
 * Qwalla / the extension) and saved in the profile as `nk`. Signing in to the
 * same account anywhere unseals it and puts it back.
 *
 * Only the account's KEM key can open it. Skipped for NIP-07 extension users
 * (their key lives in the extension).
 */
const RECIPIENT_ID = "me";

interface AuthLike {
  wallet: WalletKeys | null;
  isExtensionWallet: boolean;
}

/** The account's KEM public key + a decrypt function, or null if unavailable. */
async function kem(auth: AuthLike): Promise<{
  publicKeyHex: string;
  decrypt: (env: string) => Promise<string>;
} | null> {
  if (!auth.wallet) return null;
  if (auth.isExtensionWallet) {
    if (!extSigner.supportsKemBridge()) return null;
    const publicKeyHex = await extSigner.getEncryptionPublicKey();
    return { publicKeyHex, decrypt: (env) => extSigner.kemDecrypt(env, RECIPIENT_ID) };
  }
  const kp = await deriveKemKeypair(auth.wallet);
  return {
    publicKeyHex: kp.publicKeyHex,
    decrypt: (env) => decryptEnvelope(env, RECIPIENT_ID, kp.secretKey),
  };
}

/** Seal this account's local Nostr key for the profile, or undefined. */
export async function sealNostrKey(owner: string, auth: AuthLike): Promise<string | undefined> {
  if (getExtension()) return undefined;
  try {
    const k = await kem(auth);
    if (!k) return undefined;
    const sk = loadOrCreateSecretKey(owner);
    return await encryptForRecipients(sk, [{ id: RECIPIENT_ID, kemPublicKeyHex: k.publicKeyHex }]);
  } catch {
    return undefined;
  }
}

/**
 * If the profile holds a sealed key for the Nostr identity it names (`np`) and
 * this device has a different local key (new device, cleared storage), unseal
 * it and make it the local key. Returns true when the key was restored.
 */
export async function restoreNostrKey(owner: string, auth: AuthLike, rougePubkey: string): Promise<boolean> {
  if (getExtension() || !auth.wallet || !rougePubkey) return false;
  const profile = await getProfile(rougePubkey).catch(() => null);
  if (!profile?.nostrVault || !profile.nostrPubkey) return false;
  const current = getPublicKey(hexToBytes(loadOrCreateSecretKey(owner)));
  if (current === profile.nostrPubkey) return false; // already the right key
  try {
    const k = await kem(auth);
    if (!k) return false;
    const sk = (await k.decrypt(profile.nostrVault)).trim();
    if (!/^[0-9a-f]{64}$/i.test(sk)) return false;
    // Only accept the key the profile itself says is this account's identity.
    if (getPublicKey(hexToBytes(sk)) !== profile.nostrPubkey) return false;
    importLocalKey(owner, sk);
    return true;
  } catch {
    return false;
  }
}
