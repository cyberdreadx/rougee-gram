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

// Known RougeChain chain ids, used only as a fallback when the node's
// `/api/health` can't be reached. The node is always the source of truth.
const KNOWN_CHAIN_IDS: Record<string, string> = {
  "https://api.rougechain.io/api": "rougechain-mainnet-1",
  "https://testnet.rougechain.io/api": "rougechain-devnet-1",
};

const chainIdCache = new Map<string, string>();

/**
 * The chain id of the currently-configured network (e.g. "rougechain-mainnet-1").
 *
 * A signed payload that carries its `chainId` is bound to one network — Qwalla
 * (and the node) warn when it's missing, since the signature isn't tied to any
 * chain. The authoritative value is the node's `GET /api/health` → `chain_id`;
 * we cache it per API URL. Falls back to the known mainnet/testnet ids, then to
 * null (sign without a chainId — the pre-binding behavior the node still
 * accepts). We never guess: a wrong chainId makes the node reject the tx.
 */
export async function getChainId(): Promise<string | null> {
  const base = getConfig().apiUrl.replace(/\/+$/, "");
  const cached = chainIdCache.get(base);
  if (cached) return cached;
  try {
    const res = await fetch(`${base}/health`);
    if (res.ok) {
      const d = (await res.json()) as { chain_id?: unknown };
      if (typeof d.chain_id === "string" && d.chain_id) {
        chainIdCache.set(base, d.chain_id);
        return d.chain_id;
      }
    }
  } catch {
    /* node unreachable — fall back to a known id if we have one */
  }
  return KNOWN_CHAIN_IDS[base] ?? null;
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
