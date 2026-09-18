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
  /** Cloudflare media Worker base URL (R2-backed uploads). Takes priority over IPFS. */
  cfWorkerUrl: string;
  /** Optional shared secret if the Worker enforces UPLOAD_SECRET. */
  cfUploadSecret: string;
  /** Route video through Cloudflare Stream (adaptive HLS). Requires the Worker
   *  to be configured with Stream secrets. */
  cfStream: boolean;
  /** RouGee HQ verification Worker base URL (issues verified-badge attestations). */
  verifyWorkerUrl: string;
}

/** Well-known RougeChain networks selectable at runtime in Settings. */
export const NETWORKS = {
  testnet: { label: "Testnet", apiUrl: "https://testnet.rougechain.io/api" },
  mainnet: { label: "Mainnet", apiUrl: "https://api.rougechain.io/api" },
} as const;

export type NetworkId = keyof typeof NETWORKS | "custom";

/** Given an API URL, return the matching known network id, else "custom". */
export function networkIdForUrl(apiUrl: string): NetworkId {
  const match = (Object.keys(NETWORKS) as (keyof typeof NETWORKS)[]).find(
    (k) => NETWORKS[k].apiUrl === apiUrl,
  );
  return match ?? "custom";
}

const defaults: RuntimeConfig = {
  apiUrl: import.meta.env.VITE_ROUGE_API || "https://testnet.rougechain.io/api",
  network: import.meta.env.VITE_ROUGE_NETWORK || "testnet",
  pinataJwt: import.meta.env.VITE_PINATA_JWT || "",
  ipfsGateway:
    import.meta.env.VITE_IPFS_GATEWAY || "https://gateway.pinata.cloud/ipfs/",
  cfWorkerUrl: import.meta.env.VITE_CF_WORKER_URL || "",
  cfUploadSecret: import.meta.env.VITE_CF_UPLOAD_SECRET || "",
  cfStream: (import.meta.env.VITE_CF_STREAM || "") === "true",
  verifyWorkerUrl: import.meta.env.VITE_VERIFY_WORKER_URL || "",
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
