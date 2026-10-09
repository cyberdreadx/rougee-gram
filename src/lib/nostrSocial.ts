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
let followsEvent: Event | null = null;
let mutesEvent: Event | null = null;
let loadedFor: string | null = null;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export interface NostrSocialState {
  follows: Set<string>;
  mutes: Set<string>;
}
let snapshot: NostrSocialState = { follows, mutes };
const refresh = () => {
  snapshot = { follows, mutes };
  emit();
};

export const getNostrSocial = (): NostrSocialState => snapshot;
export function subscribeNostrSocial(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const pTags = (ev: Event | undefined): Set<string> =>
  new Set((ev?.tags ?? []).filter((t) => t[0] === "p" && t[1]).map((t) => t[1]));

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
      { kinds: [3, 10000], authors: [pubkey] },
      { maxWait: 4000 },
    );
    const newest = (k: number) =>
      evs.filter((e) => e.kind === k).sort((a, b) => b.created_at - a.created_at)[0] ?? null;
    followsEvent = newest(3);
    mutesEvent = newest(10000);
    follows = pTags(followsEvent ?? undefined);
    mutes = pTags(mutesEvent ?? undefined);
    refresh();
  } catch {
    /* relays flaky — leave empty */
  }
}

async function publishList(owner: string, kind: number, pubkeys: Set<string>, base: Event | null) {
  const otherTags = (base?.tags ?? []).filter((t) => t[0] !== "p");
  const tmpl: EventTemplate = {
    kind,
    created_at: Math.floor(Date.now() / 1000),
    tags: [...otherTags, ...[...pubkeys].map((pk) => ["p", pk])],
    content: base?.content ?? "",
  };
  const ev = await publishEvent(owner, tmpl);
  return ev;
}

export const isFollowing = (pubkey: string) => follows.has(pubkey);
export const isBlocked = (pubkey: string) => mutes.has(pubkey);

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
