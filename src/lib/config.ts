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
  /** RouGee tips-ledger Worker base URL (per-post tip attribution). */
  tipsWorkerUrl: string;
  /** RouGee story-engagement Worker base URL (off-chain views + reactions). */
  storyWorkerUrl: string;
  /** RouGee promote Worker base URL (watch-to-earn ads / boosted posts). */
  promoteWorkerUrl: string;
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
  tipsWorkerUrl: import.meta.env.VITE_TIPS_WORKER_URL || "",
  storyWorkerUrl: import.meta.env.VITE_STORY_WORKER_URL || "",
  promoteWorkerUrl: import.meta.env.VITE_PROMOTE_WORKER_URL || "",
};

// One-time migration key: users who ran the app when the default was testnet may
// have that persisted, which would shadow the new mainnet default. On first load
// after launch, drop a persisted testnet endpoint so the mainnet default applies.
// Provider wallets (Qwalla) still re-follow their actual network on connect, so a
// genuine testnet user is switched right back.
const MIGRATION_KEY = "rougee-gram:cfg-migrated-mainnet";
const OLD_TESTNET_API = "https://testnet.rougechain.io/api";

// Worker URLs come from build env and are NEVER user-settable in the UI, so they
// must always be taken from the current build — never a shadowing persisted
// value. (A past bug persisted the whole config, so an empty verifyWorkerUrl got
// saved before the worker existed and then hid it after we deployed it.)
const DEPLOY_ONLY: (keyof RuntimeConfig)[] = [
  "verifyWorkerUrl",
  "tipsWorkerUrl",
  "storyWorkerUrl",
  "promoteWorkerUrl",
];

function load(): RuntimeConfig {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<RuntimeConfig>;
    if (!localStorage.getItem(MIGRATION_KEY)) {
      localStorage.setItem(MIGRATION_KEY, "1");
      if (parsed.apiUrl === OLD_TESTNET_API) {
        delete parsed.apiUrl;
        delete parsed.network;
      }
    }
    // Deploy-only fields always come from the build, never a persisted override.
    for (const k of DEPLOY_ONLY) delete parsed[k];
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
    // Persist ONLY user deltas (fields differing from build defaults), and never
    // deploy-only worker URLs — otherwise a future default change is shadowed by
    // whatever was baked in when the config was last written.
    const delta: Record<string, unknown> = {};
    for (const key of Object.keys(current) as (keyof RuntimeConfig)[]) {
      if (DEPLOY_ONLY.includes(key)) continue;
      if (current[key] !== defaults[key]) delta[key] = current[key];
    }
    localStorage.setItem(LS_KEY, JSON.stringify(delta));
  } catch {
    /* storage may be unavailable; keep in-memory */
  }
  return current;
}

export function normalizeGateway(gateway: string): string {
  return gateway.endsWith("/") ? gateway : `${gateway}/`;
}
