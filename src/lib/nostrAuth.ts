/**
 * Nostr identity + signing for rougee-gram, ported from GLTCH. Each rouge
 * identity gets a persistent secp256k1 Nostr key (stored locally, keyed by the
 * rouge address) used to sign reactions/reposts; a NIP-07 extension is used
 * instead when present. This is the lower-stakes social key — value stays on
 * RougeChain (ML-DSA). Linking it to the rouge identity is the separate
 * identity-link flow.
 */
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  nip19,
  type Event,
  type EventTemplate,
} from "nostr-tools";
import { bytesToHex, hexToBytes } from "nostr-tools/utils";
import { NOSTR_RELAYS, getPool, NOSTR_ID_PREFIX } from "./nostrFeed";

interface Nip07 {
  getPublicKey(): Promise<string>;
  signEvent(t: EventTemplate): Promise<Event>;
}

export function getExtension(): Nip07 | null {
  const n = (globalThis as { nostr?: Nip07 }).nostr;
  return n && typeof n.signEvent === "function" ? n : null;
}

const skKey = (owner: string) => `rougee_nostr_sk_${owner}`;

/** Load (or create) the local secp256k1 key for an owner, as hex. */
export function loadOrCreateSecretKey(owner: string): string {
  const saved = localStorage.getItem(skKey(owner));
  if (saved && /^[0-9a-f]{64}$/i.test(saved)) return saved.toLowerCase();
  const hex = bytesToHex(generateSecretKey());
  localStorage.setItem(skKey(owner), hex);
  return hex;
}

export interface NostrSigner {
  pubkey: string;
  viaExtension: boolean;
  sign(t: EventTemplate): Promise<Event>;
}

export async function getSigner(owner: string): Promise<NostrSigner> {
  const ext = getExtension();
  if (ext) {
    try {
      const pubkey = await ext.getPublicKey();
      return { pubkey, viaExtension: true, sign: (t) => ext.signEvent(t) };
    } catch {
      /* extension refused — fall back to the local key */
    }
  }
  const sk = hexToBytes(loadOrCreateSecretKey(owner));
  return {
    pubkey: getPublicKey(sk),
    viaExtension: false,
    sign: async (t) => finalizeEvent(t, sk),
  };
}

export const npub = (hex: string) => nip19.npubEncode(hex);
export const shortNpub = (hex: string) => {
  const s = npub(hex);
  return `${s.slice(0, 10)}…${s.slice(-4)}`;
};

/** The raw Nostr event id behind a FeedPost id (strips the `nostr:` prefix). */
export const eventIdOf = (postId: string) =>
  postId.startsWith(NOSTR_ID_PREFIX) ? postId.slice(NOSTR_ID_PREFIX.length) : postId;

/** NIP-25 like. */
export function buildReaction(note: { id: string; pubkey: string }): EventTemplate {
  return {
    kind: 7,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["e", note.id], ["p", note.pubkey], ["k", "1"]],
    content: "+",
  };
}

/** NIP-18 repost. */
export function buildRepost(
  note: { id: string; pubkey: string },
  relayHint = NOSTR_RELAYS[0],
): EventTemplate {
  return {
    kind: 6,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["e", note.id, relayHint], ["p", note.pubkey]],
    content: "",
  };
}

export async function publishEvent(owner: string, template: EventTemplate): Promise<Event> {
  const signer = await getSigner(owner);
  const ev = await signer.sign(template);
  const results = await Promise.allSettled(getPool().publish(NOSTR_RELAYS, ev));
  if (!results.some((r) => r.status === "fulfilled")) {
    throw new Error("NO_NOSTR_RELAY_ACCEPTED");
  }
  return ev;
}

// ── "acted" store: what this device has liked/reposted, so the UI reflects it ──
type Acted = Record<string, { liked?: true; reposted?: true }>;
const ACTED_KEY = "rougee_nostr_acted";
const listeners = new Set<() => void>();

let acted: Acted = (() => {
  try {
    return JSON.parse(localStorage.getItem(ACTED_KEY) || "{}") as Acted;
  } catch {
    return {};
  }
})();

export function getActed(): Acted {
  return acted;
}

export function subscribeActed(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function markActed(id: string, kind: "liked" | "reposted"): void {
  acted = { ...acted, [id]: { ...acted[id], [kind]: true } };
  try {
    localStorage.setItem(ACTED_KEY, JSON.stringify(acted));
  } catch {
    /* ignore quota */
  }
  listeners.forEach((l) => l());
}
