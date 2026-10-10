/**
 * Nostr notifications for the viewer's key: likes (kind-7), reposts (kind-6) and
 * replies / mentions (kind-1) that tag the viewer (`#p`). One relay subscription
 * feeds a reactive store; author profiles are resolved lazily. "Unread" is
 * everything newer than the last time the Activity page was opened, persisted
 * per pubkey so the badge survives reloads.
 */
import type { Event } from "nostr-tools";
import { NOSTR_RELAYS, getPool, parseProfile, type NostrProfile } from "./nostrFeed";
import { getSigner, replyTargetOf } from "./nostrAuth";

export type NotifType = "like" | "repost" | "reply";

export interface NostrNotification {
  id: string;
  type: NotifType;
  fromPubkey: string;
  targetEventId?: string;
  content?: string;
  created_at: number;
  profile?: NostrProfile;
}

const MAX = 80;

let items: NostrNotification[] = [];
let myPubkey: string | null = null;
let lastRead = 0;
let startedFor: string | null = null;
const profiles = new Map<string, NostrProfile>();

const listeners = new Set<() => void>();
const readKey = (pk: string) => `rougee_nostr_notif_read_${pk}`;
const unreadCount = () => items.filter((n) => n.created_at > lastRead).length;

let snapshot: { items: NostrNotification[]; unread: number } = { items, unread: 0 };
const refresh = () => {
  snapshot = { items, unread: unreadCount() };
  listeners.forEach((l) => l());
};

export const getNotificationsState = () => snapshot;
export function subscribeNotifications(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Mark everything seen — clears the unread badge. Call when Activity opens. */
export function markNotificationsRead(): void {
  if (!items.length) return;
  lastRead = Math.max(lastRead, items[0].created_at); // items are newest-first
  if (myPubkey) {
    try {
      localStorage.setItem(readKey(myPubkey), String(lastRead));
    } catch {
      /* ignore quota */
    }
  }
  refresh();
}

const firstETag = (ev: Event, fromEnd = false): string | undefined => {
  const es = ev.tags.filter((t) => t[0] === "e" && t[1]);
  return (fromEnd ? es[es.length - 1] : es[0])?.[1];
};

/** Subscribe to events that tag the viewer. Idempotent per pubkey. */
export async function startNostrNotifications(owner: string): Promise<void> {
  let pubkey: string;
  try {
    pubkey = (await getSigner(owner)).pubkey;
  } catch {
    return;
  }
  if (startedFor === pubkey) return;
  startedFor = pubkey;
  myPubkey = pubkey;
  try {
    lastRead = Number(localStorage.getItem(readKey(pubkey))) || 0;
  } catch {
    lastRead = 0;
  }

  const seen = new Set<string>();
  const wantProfiles = new Set<string>();

  const upsert = (ev: Event) => {
    if (ev.pubkey === pubkey || seen.has(ev.id)) return; // skip our own
    let type: NotifType | null = null;
    let targetEventId: string | undefined;
    if (ev.kind === 7) {
      if (ev.content.trim() === "-") return; // NIP-25 downvote isn't a like
      type = "like";
      targetEventId = firstETag(ev, true);
    } else if (ev.kind === 6) {
      type = "repost";
      targetEventId = firstETag(ev);
    } else if (ev.kind === 1) {
      type = "reply";
      targetEventId = replyTargetOf(ev);
    }
    if (!type) return;
    seen.add(ev.id);
    items = [
      {
        id: ev.id,
        type,
        fromPubkey: ev.pubkey,
        targetEventId,
        content: ev.kind === 1 ? ev.content : undefined,
        created_at: ev.created_at,
        profile: profiles.get(ev.pubkey),
      },
      ...items,
    ]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, MAX);
    if (!profiles.has(ev.pubkey)) wantProfiles.add(ev.pubkey);
    refresh();
  };

  getPool().subscribeMany(
    NOSTR_RELAYS,
    { kinds: [1, 6, 7], "#p": [pubkey], limit: 100 },
    { onevent: upsert },
  );

  // Resolve the senders' kind-0 profiles (name + avatar) in the background.
  setInterval(async () => {
    const want = [...wantProfiles].slice(0, 40);
    if (!want.length) return;
    want.forEach((pk) => wantProfiles.delete(pk));
    try {
      const metas = await getPool().querySync(
        NOSTR_RELAYS,
        { kinds: [0], authors: want },
        { maxWait: 4000 },
      );
      let changed = false;
      for (const m of metas) {
        if (profiles.has(m.pubkey)) continue;
        const p = parseProfile(m.content);
        if (p) {
          profiles.set(m.pubkey, p);
          changed = true;
        }
      }
      if (changed) {
        items = items.map((n) => (n.profile ? n : { ...n, profile: profiles.get(n.fromPubkey) }));
        refresh();
      }
    } catch {
      /* relays flaky; retry next tick */
    }
  }, 1500);
}
