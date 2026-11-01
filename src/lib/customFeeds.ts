import { useSyncExternalStore } from "react";
import { nip19 } from "nostr-tools";
import { rc } from "@/lib/rouge";
import { resolveUsername } from "@/lib/username";

/**
 * Custom feeds: named lists of accounts from RougeChain and Nostr whose posts
 * show up as their own Home tab — no follow needed. Stored per account on this
 * device (localStorage).
 */
export interface FeedMember {
  /** RougeChain public key, or Nostr hex pubkey. */
  id: string;
  network: "rouge" | "nostr";
  /** Display name captured when added, so the editor can label it offline. */
  name?: string;
}

export interface CustomFeed {
  id: string;
  name: string;
  members: FeedMember[];
}

const keyFor = (owner: string) => `rougee:custom-feeds:${owner || "anon"}`;
const listeners = new Set<() => void>();
const cache = new Map<string, CustomFeed[]>();

function read(owner: string): CustomFeed[] {
  const hit = cache.get(owner);
  if (hit) return hit;
  let feeds: CustomFeed[] = [];
  try {
    const raw = localStorage.getItem(keyFor(owner));
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) feeds = parsed.filter((f) => f && f.id && Array.isArray(f.members));
  } catch {
    /* corrupt or unavailable — start empty */
  }
  cache.set(owner, feeds);
  return feeds;
}

function write(owner: string, feeds: CustomFeed[]) {
  cache.set(owner, feeds);
  try {
    localStorage.setItem(keyFor(owner), JSON.stringify(feeds));
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useCustomFeeds(owner: string): CustomFeed[] {
  return useSyncExternalStore(subscribe, () => read(owner));
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function createFeed(owner: string, name: string, first?: FeedMember): CustomFeed {
  const feed: CustomFeed = {
    id: newId(),
    name: name.trim().slice(0, 40) || "My feed",
    members: first ? [first] : [],
  };
  write(owner, [...read(owner), feed]);
  return feed;
}

export function renameFeed(owner: string, id: string, name: string) {
  const n = name.trim().slice(0, 40);
  if (!n) return;
  write(owner, read(owner).map((f) => (f.id === id ? { ...f, name: n } : f)));
}

export function deleteFeed(owner: string, id: string) {
  write(owner, read(owner).filter((f) => f.id !== id));
}

const sameMember = (a: FeedMember, b: FeedMember) => a.id === b.id && a.network === b.network;

export function addMember(owner: string, feedId: string, m: FeedMember) {
  write(
    owner,
    read(owner).map((f) =>
      f.id !== feedId || f.members.some((x) => sameMember(x, m))
        ? f
        : { ...f, members: [...f.members, m] },
    ),
  );
}

export function removeMember(owner: string, feedId: string, m: FeedMember) {
  write(
    owner,
    read(owner).map((f) =>
      f.id === feedId ? { ...f, members: f.members.filter((x) => !sameMember(x, m)) } : f,
    ),
  );
}

export const hasMember = (feed: CustomFeed, m: FeedMember) =>
  feed.members.some((x) => sameMember(x, m));

/**
 * Turn what someone typed into an account: `npub1…` / 64-char hex → Nostr;
 * `rouge1…` address, longer hex pubkey, or `@handle` → RougeChain.
 */
export async function resolveMemberInput(raw: string): Promise<FeedMember | null> {
  const s = raw.trim().replace(/^nostr:/i, "");
  if (!s) return null;
  if (/^npub1/i.test(s) || /^nprofile1/i.test(s)) {
    try {
      const d = nip19.decode(s);
      if (d.type === "npub") return { id: d.data as string, network: "nostr" };
      if (d.type === "nprofile")
        return { id: (d.data as { pubkey: string }).pubkey, network: "nostr" };
    } catch {
      return null;
    }
    return null;
  }
  if (/^[0-9a-f]{64}$/i.test(s)) return { id: s.toLowerCase(), network: "nostr" };
  if (/^[0-9a-f]{100,}$/i.test(s)) return { id: s.toLowerCase(), network: "rouge" };
  if (/^rouge1/i.test(s)) {
    try {
      const res = (await rc().resolveAddress(s)) as { publicKey?: string };
      return res?.publicKey ? { id: res.publicKey, network: "rouge" } : null;
    } catch {
      return null;
    }
  }
  const handle = s.replace(/^@/, "");
  const hit = await resolveUsername(handle);
  return hit ? { id: hit.pubkey, network: "rouge", name: `@${handle.toLowerCase()}` } : null;
}
