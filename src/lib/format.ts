import { pubkeyToAddress } from "@rougechain/sdk";

/** Short display form of a rouge1… address or raw pubkey. */
export function shortAddress(addr: string, lead = 8, tail = 4): string {
  if (!addr) return "";
  if (addr.length <= lead + tail + 1) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

// Resolving a ~3900-char pubkey to a bech32m address is pure crypto (hashing),
// but not free — cache results for the session.
const addrCache = new Map<string, string>();

export async function resolveAddress(pubkey: string): Promise<string> {
  if (!pubkey) return "";
  const hit = addrCache.get(pubkey);
  if (hit) return hit;
  try {
    const addr = await pubkeyToAddress(pubkey);
    addrCache.set(pubkey, addr);
    return addr;
  } catch {
    // Fall back to a short slice of the hex pubkey.
    const fallback = `rouge?${pubkey.slice(0, 10)}`;
    addrCache.set(pubkey, fallback);
    return fallback;
  }
}

/** Synchronous best-effort: returns cached address or a hex fallback. */
export function addressSync(pubkey: string): string {
  return addrCache.get(pubkey) ?? `${pubkey.slice(0, 10)}…`;
}

/** A stable, human-ish handle derived from a rouge1 address. */
export function handleFromAddress(addr: string): string {
  if (!addr) return "anon";
  const body = addr.startsWith("rouge1") ? addr.slice(6) : addr;
  return body.slice(0, 8).toLowerCase();
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Compact "3m", "5h", "2d" style relative time from an ISO string or ms/sec epoch. */
export function timeAgo(input: string | number): string {
  const ms = toMs(input);
  if (!ms) return "";
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  if (sec < 45) return "now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w`;
  const date = new Date(ms);
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions =
    date.getFullYear() === now.getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return date.toLocaleDateString(undefined, opts);
}

/** Longer relative phrasing for detail views. */
export function timeAgoLong(input: string | number): string {
  const ms = toMs(input);
  if (!ms) return "";
  const diff = Date.now() - ms;
  const sec = Math.round(diff / 1000);
  const table: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, secs] of table) {
    const val = Math.floor(sec / secs);
    if (val >= 1) return rtf.format(-val, unit);
  }
  return "just now";
}

function toMs(input: string | number): number {
  if (typeof input === "number") {
    // Heuristic: seconds vs milliseconds.
    return input < 1e12 ? input * 1000 : input;
  }
  const n = Number(input);
  if (!Number.isNaN(n) && input.trim() !== "") {
    return n < 1e12 ? n * 1000 : n;
  }
  const parsed = Date.parse(input);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
