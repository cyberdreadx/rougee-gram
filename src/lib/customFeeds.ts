import { useSyncExternalStore } from "react";
import { nip19, type Event, type EventTemplate } from "nostr-tools";
import { rc } from "@/lib/rouge";
import { resolveUsername } from "@/lib/username";
import { NOSTR_RELAYS, getPool } from "@/lib/nostrFeed";
import { getSigner } from "@/lib/nostrAuth";

/**
 * Custom feeds: named lists of RougeChain + Nostr accounts whose posts show up
 * as their own Home tab — no follow needed.
 *
 * Each feed is a NIP-51 follow set (kind 30000, `d` = feed id) signed by the
 * viewer's Nostr key, so feeds follow them to any device. Private feeds (the
 * default) keep the title and members NIP-44-encrypted to the viewer's own key;
 * public feeds list them as plain tags so other Nostr clients can read them.
 * RougeChain accounts are `["rouge", pubkey, name]` tags (other clients ignore
 * them). A copy is kept in localStorage so feeds load instantly and survive
 * flaky relays.
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
  /** Public lists are readable by anyone; private ones only by you. */
  public?: boolean;
  /** Unix seconds of the last change — newest copy wins when syncing. */
  updatedAt?: number;
}

interface Store {
  feeds: CustomFeed[];
  /** Deleted feed id → when, so a stale relay copy can't bring it back. */
  deleted: Record<string, number>;
}

const FEED_KIND = 30000;
/** NIP-32 label marking follow sets that are Rougee feeds. */
const LABEL_NS = "app.rougee";
const LABEL = "feed";

const keyFor = (owner: string) => `rougee:custom-feeds:${owner || "anon"}`;
const listeners = new Set<() => void>();
const cache = new Map<string, Store>();
const now = () => Math.floor(Date.now() / 1000);

function load(owner: string): Store {
  const hit = cache.get(owner);
  if (hit) return hit;
  let store: Store = { feeds: [], deleted: {} };
  try {
    const raw = localStorage.getItem(keyFor(owner));
    const parsed = raw ? JSON.parse(raw) : null;
    // v1 stored a bare array of feeds.
    const feeds = Array.isArray(parsed) ? parsed : parsed?.feeds;
    if (Array.isArray(feeds))
      store.feeds = feeds.filter((f) => f && f.id && Array.isArray(f.members));
    if (parsed && !Array.isArray(parsed) && parsed.deleted) store.deleted = parsed.deleted;
  } catch {
    /* corrupt or unavailable — start empty */
  }
  cache.set(owner, store);
  return store;
}

function save(owner: string, store: Store) {
  cache.set(owner, store);
  try {
    localStorage.setItem(keyFor(owner), JSON.stringify(store));
  } catch {
    /* ignore quota / private mode */
  }
  listeners.forEach((l) => l());
}

/** Apply a change to one feed (or create/delete it) and queue it for relays. */
function change(owner: string, feedId: string, fn: (f: CustomFeed) => CustomFeed | null) {
  const s = load(owner);
  const feeds: CustomFeed[] = [];
  const deleted = { ...s.deleted };
  for (const f of s.feeds) {
    if (f.id !== feedId) {
      feeds.push(f);
      continue;
    }
    const next = fn(f);
    if (next) feeds.push({ ...next, updatedAt: now() });
    else deleted[f.id] = now();
  }
  save(owner, { feeds, deleted });
  schedulePublish(owner, feedId);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useCustomFeeds(owner: string): CustomFeed[] {
  return useSyncExternalStore(subscribe, () => load(owner).feeds);
}

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export function createFeed(owner: string, name: string, first?: FeedMember): CustomFeed {
  const feed: CustomFeed = {
    id: newId(),
    name: name.trim().slice(0, 40) || "My feed",
    members: first ? [first] : [],
    public: false,
    updatedAt: now(),
  };
  const s = load(owner);
  save(owner, { ...s, feeds: [...s.feeds, feed] });
  schedulePublish(owner, feed.id);
  return feed;
}

export function renameFeed(owner: string, id: string, name: string) {
  const n = name.trim().slice(0, 40);
  const cur = load(owner).feeds.find((f) => f.id === id);
  if (!n || !cur || cur.name === n) return;
  change(owner, id, (f) => ({ ...f, name: n }));
}

export function setFeedPublic(owner: string, id: string, isPublic: boolean) {
  change(owner, id, (f) => ({ ...f, public: isPublic }));
}

export function deleteFeed(owner: string, id: string) {
  change(owner, id, () => null);
}

const sameMember = (a: FeedMember, b: FeedMember) => a.id === b.id && a.network === b.network;

export function addMember(owner: string, feedId: string, m: FeedMember) {
  change(owner, feedId, (f) =>
    f.members.some((x) => sameMember(x, m)) ? f : { ...f, members: [...f.members, m] },
  );
}

export function removeMember(owner: string, feedId: string, m: FeedMember) {
  change(owner, feedId, (f) => ({ ...f, members: f.members.filter((x) => !sameMember(x, m)) }));
}

export const hasMember = (feed: CustomFeed, m: FeedMember) =>
  feed.members.some((x) => sameMember(x, m));

// ---------------------------------------------------------------------------
// Nostr sync
// ---------------------------------------------------------------------------

const memberTags = (f: CustomFeed): string[][] => [
  ["title", f.name],
  ...f.members.map((m) =>
    m.network === "nostr" ? ["p", m.id, "", m.name ?? ""] : ["rouge", m.id, m.name ?? ""],
  ),
];

function parseMemberTags(tags: string[][]): { name?: string; members: FeedMember[] } {
  let name: string | undefined;
  const members: FeedMember[] = [];
  for (const t of tags) {
    if (!Array.isArray(t) || typeof t[1] !== "string" || !t[1]) continue;
    if (t[0] === "title") name = t[1];
    else if (t[0] === "p" && /^[0-9a-f]{64}$/i.test(t[1]))
      members.push({ id: t[1].toLowerCase(), network: "nostr", name: t[3] || undefined });
    else if (t[0] === "rouge") members.push({ id: t[1], network: "rouge", name: t[2] || undefined });
  }
  return { name, members };
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce relay writes so rapid edits publish once. */
function schedulePublish(owner: string, feedId: string) {
  if (!owner || owner === "anon") return;
  const k = `${owner}|${feedId}`;
  clearTimeout(timers.get(k));
  timers.set(
    k,
    setTimeout(() => {
      timers.delete(k);
      publishFeed(owner, feedId).catch(() => {
        /* stays local; the next sync retries */
      });
    }, 1200),
  );
}

async function publishFeed(owner: string, feedId: string): Promise<void> {
  const s = load(owner);
  const feed = s.feeds.find((f) => f.id === feedId);
  const signer = await getSigner(owner);
  const base = [
    ["d", feedId],
    ["L", LABEL_NS],
    ["l", LABEL, LABEL_NS],
  ];
  let tmpl: EventTemplate;
  if (!feed) {
    // Tombstone: an empty set replaces the old one everywhere.
    tmpl = {
      kind: FEED_KIND,
      created_at: Math.max(now(), s.deleted[feedId] ?? 0),
      tags: [...base, ["deleted", "1"]],
      content: "",
    };
  } else if (feed.public) {
    tmpl = {
      kind: FEED_KIND,
      created_at: Math.max(now(), feed.updatedAt ?? 0),
      tags: [...base, ...memberTags(feed)],
      content: "",
    };
  } else {
    // Private: no readable title or members — only your key can decrypt.
    if (!signer.selfCrypt) return; // extension without NIP-44: keep on-device
    tmpl = {
      kind: FEED_KIND,
      created_at: Math.max(now(), feed.updatedAt ?? 0),
      tags: base,
      content: await signer.selfCrypt.encrypt(JSON.stringify(memberTags(feed))),
    };
  }
  const ev = await signer.sign(tmpl);
  await Promise.any(getPool().publish(NOSTR_RELAYS, ev));
}

const synced = new Set<string>();

/**
 * Pull this account's feeds from relays and merge with the local copy (newest
 * change wins), then push anything relays are missing. Runs once per session.
 */
export async function syncFeeds(owner: string): Promise<void> {
  if (!owner || owner === "anon" || synced.has(owner)) return;
  synced.add(owner);
  let signer;
  try {
    signer = await getSigner(owner);
  } catch {
    return;
  }
  let events: Event[];
  try {
    events = await getPool().querySync(
      NOSTR_RELAYS,
      { kinds: [FEED_KIND], authors: [signer.pubkey], "#l": [LABEL] },
      { maxWait: 5000 },
    );
  } catch {
    synced.delete(owner);
    return;
  }

  // Newest event per feed id.
  const latest = new Map<string, Event>();
  for (const e of events) {
    if (!e.tags.some((t) => t[0] === "L" && t[1] === LABEL_NS)) continue;
    const d = e.tags.find((t) => t[0] === "d")?.[1];
    if (!d) continue;
    const prev = latest.get(d);
    if (!prev || e.created_at > prev.created_at) latest.set(d, e);
  }

  const s = load(owner);
  const feeds = new Map(s.feeds.map((f) => [f.id, f]));
  const deleted = { ...s.deleted };
  const toPush = new Set<string>();

  for (const [id, e] of latest) {
    const local = feeds.get(id);
    const localTs = local?.updatedAt ?? deleted[id] ?? -1;
    if (e.created_at < localTs) {
      toPush.add(id); // ours is newer
      continue;
    }
    if (e.created_at === localTs) continue;
    if (e.tags.some((t) => t[0] === "deleted")) {
      feeds.delete(id);
      deleted[id] = e.created_at;
      continue;
    }
    let parsed: { name?: string; members: FeedMember[] };
    if (e.content) {
      if (!signer.selfCrypt) continue;
      try {
        parsed = parseMemberTags(JSON.parse(await signer.selfCrypt.decrypt(e.content)));
      } catch {
        continue;
      }
    } else {
      parsed = parseMemberTags(e.tags);
    }
    feeds.set(id, {
      id,
      name: parsed.name || local?.name || "Feed",
      members: parsed.members,
      public: !e.content,
      updatedAt: e.created_at,
    });
    delete deleted[id];
  }
  // Local feeds relays have never seen. (A newer local deletion of a feed
  // relays still show was already queued above.)
  for (const id of feeds.keys()) if (!latest.has(id)) toPush.add(id);

  save(owner, { feeds: [...feeds.values()], deleted });
  for (const id of toPush) schedulePublish(owner, id);
}

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
