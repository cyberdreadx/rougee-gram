import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Globe, Loader2 } from "lucide-react";
import { NOSTR_RELAYS, getPool, parseProfile, type NostrProfile } from "@/lib/nostrFeed";
import { shortNpub } from "@/lib/nostrAuth";
import { proxiedImage, onProxyError } from "@/lib/imageProxy";
import { usePostLikers } from "@/hooks/useSocial";
import { resolveNostrPubkey } from "@/lib/nostrLink";
import Modal from "./Modal";
import UserRow from "./UserRow";
import Avatar from "./Avatar";

/** Kind-0 profiles for a set of Nostr pubkeys. */
function useNostrProfiles(pubkeys: string[]) {
  return useQuery({
    queryKey: ["nostrProfiles", [...pubkeys].sort().join(",")],
    enabled: pubkeys.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const evs = await getPool().querySync(
        NOSTR_RELAYS,
        { kinds: [0], authors: pubkeys },
        { maxWait: 4000 },
      );
      const newest = new Map<string, { at: number; p: NostrProfile }>();
      for (const e of evs) {
        const p = parseProfile(e.content);
        const cur = newest.get(e.pubkey);
        if (p && (!cur || e.created_at > cur.at)) newest.set(e.pubkey, { at: e.created_at, p });
      }
      return new Map([...newest].map(([k, v]) => [k, v.p]));
    },
  });
}

/**
 * Who liked a post. Nostr likes carry identities, so they're listed by name;
 * RougeChain only exposes a like count today, so those are shown as a number.
 */
export default function LikesSheet({
  postId,
  chainLikes,
  nostrLikers,
  onClose,
}: {
  postId: string;
  chainLikes: number;
  nostrLikers: string[];
  onClose: () => void;
}) {
  // RougeChain likers by name, where the node serves its who-liked route.
  const { data: chain, isLoading: chainLoading } = usePostLikers(postId, 100);
  const chainLikers = chain?.likers ?? [];
  // People who liked on both (a Rougee like is mirrored to Nostr) show once,
  // under RougeChain: drop Nostr likers that are a RougeChain liker's own key.
  const { data: linked } = useQuery({
    queryKey: ["likerNostrKeys", [...chainLikers].sort().join(",")],
    enabled: chainLikers.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () =>
      new Set(
        (await Promise.all(chainLikers.map((pk) => resolveNostrPubkey(pk).catch(() => null)))).filter(
          (x): x is string => !!x,
        ),
      ),
  });
  const nostrOnly = linked ? nostrLikers.filter((pk) => !linked.has(pk)) : nostrLikers;
  const { data: profiles, isLoading } = useNostrProfiles(nostrOnly);
  return (
    <Modal onClose={onClose} title="Likes">
      {nostrOnly.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <Globe className="h-3.5 w-3.5" /> On Nostr · {nostrOnly.length}
          </div>
          <div className="space-y-3">
            {nostrOnly.map((pk) => {
              const p = profiles?.get(pk);
              const name = p?.name?.trim() || shortNpub(pk);
              return (
                <Link
                  key={pk}
                  to={`/nostr/${pk}`}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-lg hover:bg-white/5"
                >
                  {p?.picture ? (
                    <img
                      src={proxiedImage(p.picture, 40)}
                      onError={(e) => onProxyError(e.currentTarget, p.picture!)}
                      referrerPolicy="no-referrer"
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <Avatar seed={pk} name={name} size={40} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{name}</div>
                    <div className="truncate text-xs text-ink-muted">{shortNpub(pk)}</div>
                  </div>
                </Link>
              );
            })}
            {isLoading && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
              </div>
            )}
          </div>
        </div>
      )}

      {chainLikes > 0 && (
        <div className={nostrOnly.length ? "mt-5 border-t border-ink-border pt-4" : ""}>
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            On RougeChain · {chainLikes}
          </div>
          {chainLikers.length > 0 ? (
            <div className="mt-2 space-y-3" onClick={onClose}>
              {chainLikers.map((pk) => (
                <UserRow key={pk} pubkey={pk} showFollow={false} subtitle="RougeChain" />
              ))}
            </div>
          ) : chainLoading ? (
            <div className="flex justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
            </div>
          ) : (
            <p className="text-sm text-ink-muted">
              This RougeChain node shows how many people liked a post, but not who.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
