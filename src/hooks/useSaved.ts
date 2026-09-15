import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SocialPost } from "@rougechain/sdk";
import { rc } from "@/lib/rouge";
import { useAuth } from "@/store/auth";

/**
 * Saved posts ("bookmarks"). Instagram keeps a private, per-account collection
 * of saved posts — there's no on-chain primitive for it, so RouGee stores the
 * list locally in the browser, namespaced per wallet address. Newest first.
 *
 * Internal storage key stays under the `rougee-gram:` namespace (see the
 * project's other localStorage keys) so a display rename never orphans data.
 */
const PREFIX = "rougee-gram:saved:";
const keyFor = (address: string) => PREFIX + address;

const listeners = new Set<() => void>();
function emit() {
  for (const l of listeners) l();
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith(PREFIX)) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function readRaw(address: string): string {
  if (!address) return "[]";
  return localStorage.getItem(keyFor(address)) || "[]";
}

function writeIds(address: string, ids: string[]) {
  if (!address) return;
  localStorage.setItem(keyFor(address), JSON.stringify(ids));
  emit();
}

/** The current account's saved post ids, newest first. Reactively updates. */
export function useSavedIds(): string[] {
  const { address } = useAuth();
  // Snapshot is the raw string (a stable primitive) so useSyncExternalStore
  // never sees a new reference each render; parse it with a memo.
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(address),
    () => "[]",
  );
  return useMemo(() => {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as string[]) : [];
    } catch {
      return [];
    }
  }, [raw]);
}

export function useIsSaved(postId: string): boolean {
  const ids = useSavedIds();
  return ids.includes(postId);
}

/** Returns a stable toggle that adds/removes a post id from the saved list. */
export function useToggleSave(): (postId: string) => boolean {
  const { address } = useAuth();
  return useCallback(
    (postId: string) => {
      const ids = (() => {
        try {
          const v = JSON.parse(readRaw(address));
          return Array.isArray(v) ? (v as string[]) : [];
        } catch {
          return [];
        }
      })();
      const has = ids.includes(postId);
      const next = has ? ids.filter((x) => x !== postId) : [postId, ...ids];
      writeIds(address, next);
      return !has; // new saved state
    },
    [address],
  );
}

/** Fetches the SocialPost objects for the current account's saved ids. */
export function useSavedPosts() {
  const { publicKey } = useAuth();
  const ids = useSavedIds();
  return useQuery({
    queryKey: ["savedPosts", publicKey, ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<SocialPost[]> => {
      const fetched = await Promise.all(
        ids.map((id) =>
          rc()
            .social.getPost(id, publicKey)
            .then((r) => r?.post ?? null)
            .catch(() => null),
        ),
      );
      // Preserve saved order (newest-first) and drop any that failed to load.
      return fetched.filter((p): p is SocialPost => Boolean(p));
    },
  });
}
