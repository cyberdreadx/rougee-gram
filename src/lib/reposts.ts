/**
 * Device-local record of posts you've reposted, mapping the original post id to
 * the id of the repost post you created. The repost itself lives on-chain (a
 * real post), so this is only a convenience cache: it lets the button show its
 * "reposted" state instantly and gives us the id to delete when you un-repost.
 * Not source of truth — just this device's view, keyed by your pubkey.
 */
const KEY = "rougee-gram:reposts";

type Store = Record<string, Record<string, string>>; // pubkey -> originalId -> repostId

function readAll(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

function writeAll(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* storage unavailable — the on-chain repost still stands */
  }
}

/** The id of your repost of `originalId`, if this device recorded one. */
export function myRepostId(pubkey: string, originalId: string): string | undefined {
  return readAll()[pubkey]?.[originalId];
}

/** Remember that you reposted `originalId` as post `repostId`. */
export function recordRepost(pubkey: string, originalId: string, repostId: string): void {
  const store = readAll();
  (store[pubkey] ??= {})[originalId] = repostId;
  writeAll(store);
}

/** Forget your repost of `originalId` (after undo). */
export function clearRepost(pubkey: string, originalId: string): void {
  const store = readAll();
  if (store[pubkey]) {
    delete store[pubkey][originalId];
    writeAll(store);
  }
}
