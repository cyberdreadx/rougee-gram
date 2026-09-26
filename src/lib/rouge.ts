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

/** Newest transaction hash for a public key (or null). The transfer API doesn't
 *  reliably return a txId in its response, so after a transfer we read it from
 *  the sender's history — the newest entry is the just-submitted tx. */
export async function latestTxId(pubkey: string): Promise<string | null> {
  try {
    const base = getConfig().apiUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/address/${encodeURIComponent(pubkey)}/transactions?limit=1`);
    if (!res.ok) return null;
    const d = (await res.json()) as { transactions?: unknown[]; txs?: unknown[] } | unknown[];
    const txs = (Array.isArray(d) ? d : (d.transactions ?? d.txs ?? [])) as Record<string, string>[];
    const t = txs[0];
    return t ? (t.txId ?? t.tx_hash ?? t.hash ?? null) : null;
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The txId for a just-submitted transfer: from the response if present, else
 *  polled from the sender's history (indexing lags a moment). */
export async function resolveTxId(res: unknown, senderPubkey: string): Promise<string | null> {
  const r = res as { txId?: string; data?: { txId?: string } } | undefined;
  const fromRes = r?.txId ?? r?.data?.txId;
  if (fromRes) return fromRes;
  for (const wait of [1200, 2500, 4000]) {
    await sleep(wait);
    const id = await latestTxId(senderPubkey);
    if (id) return id;
  }
  return null;
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
