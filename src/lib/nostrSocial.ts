/**
 * Nostr follow (NIP-02 kind-3 contacts) + block (NIP-51 kind-10000 mute list)
 * for the viewer's Nostr key. Lists are loaded once from relays, kept in a
 * reactive store, and updated optimistically. When republishing we preserve the
 * loaded event's content + non-`p` tags so an extension key's real follow /
 * relay data is never clobbered — we only add/remove one pubkey.
 */
import type { Event, EventTemplate } from "nostr-tools";
import { NOSTR_RELAYS, getPool } from "./nostrFeed";
import { getSigner, publishEvent } from "./nostrAuth";

let follows = new Set<string>();
let mutes = new Set<string>();
let bookmarks = new Set<string>();
let followsEvent: Event | null = null;
let mutesEvent: Event | null = null;
let bookmarksEvent: Event | null = null;
let loadedFor: string | null = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export interface NostrSocialState {
  follows: Set<string>;
  mutes: Set<string>;
  bookmarks: Set<string>;
}
let snapshot: NostrSocialState = { follows, mutes, bookmarks };
const refresh = () => {
  snapshot = { follows, mutes, bookmarks };
  emit();
};

export const getNostrSocial = (): NostrSocialState => snapshot;
export function subscribeNostrSocial(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const tagValues = (ev: Event | undefined, name: string): Set<string> =>
  new Set((ev?.tags ?? []).filter((t) => t[0] === name && t[1]).map((t) => t[1]));
const pTags = (ev: Event | undefined) => tagValues(ev, "p");

/** Load the viewer's contacts (kind-3) + mute list (kind-10000) once. */
export async function loadNostrLists(owner: string): Promise<void> {
  let pubkey: string;
  try {
    pubkey = (await getSigner(owner)).pubkey;
  } catch {
    return;
  }
  if (loadedFor === pubkey) return;
  loadedFor = pubkey;
  try {
    const evs = await getPool().querySync(
      NOSTR_RELAYS,
      { kinds: [3, 10000, 10003], authors: [pubkey] },
      { maxWait: 4000 },
    );
    const newest = (k: number) =>
      evs.filter((e) => e.kind === k).sort((a, b) => b.created_at - a.created_at)[0] ?? null;
    followsEvent = newest(3);
    mutesEvent = newest(10000);
    bookmarksEvent = newest(10003);
    follows = pTags(followsEvent ?? undefined);
    mutes = pTags(mutesEvent ?? undefined);
    bookmarks = tagValues(bookmarksEvent ?? undefined, "e");
    refresh();
  } catch {
    /* relays flaky — leave empty */
  }
}

async function publishList(
  owner: string,
  kind: number,
  values: Set<string>,
  base: Event | null,
  tagName = "p",
) {
  const otherTags = (base?.tags ?? []).filter((t) => t[0] !== tagName);
  const tmpl: EventTemplate = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [...otherTags, ...[...values].map((v) => [tagName, v])],
    content: base?.content ?? "",
  };
  return await publishEvent(owner, tmpl);
}

export const isFollowing = (pubkey: string) => follows.has(pubkey);
export const isBlocked = (pubkey: string) => mutes.has(pubkey);
export const isBookmarked = (eventId: string) => bookmarks.has(eventId);

/** Mirror a local save to a NIP-51 bookmark list (kind-10003) so it's portable. */
export async function setBookmark(owner: string, eventId: string, on: boolean): Promise<void> {
  const next = new Set(bookmarks);
  if (on) next.add(eventId);
  else next.delete(eventId);
  bookmarks = next;
  refresh();
  try {
    bookmarksEvent = await publishList(owner, 10003, bookmarks, bookmarksEvent, "e");
  } catch {
    /* keep optimistic */
  }
}

export async function setFollow(owner: string, pubkey: string, on: boolean): Promise<void> {
  const next = new Set(follows);
  if (on) next.add(pubkey);
  else next.delete(pubkey);
  follows = next;
  refresh();
  try {
    followsEvent = await publishList(owner, 3, follows, followsEvent);
  } catch {
    /* keep the optimistic state; relays may still have accepted on retry */
  }
}

export async function setBlock(owner: string, pubkey: string, on: boolean): Promise<void> {
  const next = new Set(mutes);
  if (on) next.add(pubkey);
  else next.delete(pubkey);
  mutes = next;
  refresh();
  try {
    mutesEvent = await publishList(owner, 10000, mutes, mutesEvent);
  } catch {
    /* keep optimistic */
  }
}
