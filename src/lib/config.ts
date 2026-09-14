/**
 * Runtime configuration. Values come from Vite env vars at build time but can be
 * overridden at runtime (persisted in localStorage) via the Settings page —
 * handy for pasting a Pinata JWT or switching networks without a rebuild.
 */

const LS_KEY = "rougee-gram:config";

export interface RuntimeConfig {
  apiUrl: string;
  network: string;
  pinataJwt: string;
  ipfsGateway: string;
}

const defaults: RuntimeConfig = {
  apiUrl: import.meta.env.VITE_ROUGE_API || "https://testnet.rougechain.io/api",
  network: import.meta.env.VITE_ROUGE_NETWORK || "testnet",
  pinataJwt: import.meta.env.VITE_PINATA_JWT || "",
  ipfsGateway:
    import.meta.env.VITE_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/",
};

function load(): RuntimeConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<RuntimeConfig>;
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

let current = load();

export function getConfig(): RuntimeConfig {
  return current;
}

export function updateConfig(patch: Partial<RuntimeConfig>): RuntimeConfig {
  current = { ...current, ...patch };
  try {
    // Only persist the deltas that differ from build-time defaults.
    localStorage.setItem(LS_KEY, JSON.stringify(current));
  } catch {
    /* storage may be unavailable; keep in-memory */
  }
  return current;
}

export function normalizeGateway(gateway: string): string {
  return gateway.endsWith("/") ? gateway : `${gateway}/`;
}
