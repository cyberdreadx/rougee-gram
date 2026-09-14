import { RougeChain, type WalletKeys } from "@rougechain/sdk";
import { getConfig } from "./config";

/**
 * Singleton RougeChain client. Rebuilt if the configured API URL changes at
 * runtime (via Settings).
 */
let instance: RougeChain | null = null;
let builtFor = "";

export function rc(): RougeChain {
  const { apiUrl } = getConfig();
  if (!instance || builtFor !== apiUrl) {
    instance = new RougeChain(apiUrl);
    builtFor = apiUrl;
  }
  return instance;
}

/** Total liquid XRGE balance for a public key (0 on error). */
export async function getXrgeBalance(publicKey: string): Promise<number> {
  try {
    const res = await rc().getBalance(publicKey);
    return typeof res.balance === "number" ? res.balance : 0;
  } catch {
    return 0;
  }
}

/** Request testnet tokens. Safe to call repeatedly; ignores "already funded". */
export async function requestFaucet(wallet: WalletKeys): Promise<boolean> {
  try {
    const res = await rc().faucet(wallet);
    return Boolean(res.success);
  } catch {
    return false;
  }
}
