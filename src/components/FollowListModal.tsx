import type { UseQueryResult } from "@tanstack/react-query";
import { Loader2, Users } from "lucide-react";
import { useFollowing, useFollowers } from "@/hooks/useSocial";
import Modal from "./Modal";
import UserRow from "./UserRow";

/**
 * Shared body for the Following / Followers lists. Each modal wrapper runs its
 * own query so the network call only fires while that list is open.
 *
 * Note: Followers is powered by a node reverse-index read (see lib/follows.ts) —
 * both directions are now browsable, keyed by pubkey.
 */
function FollowList({
  query,
  emptyText,
}: {
  query: UseQueryResult<string[]>;
  emptyText: string;
}) {
  const list = (query.data ?? []).filter(
    (x): x is string => typeof x === "string" && x.length > 0,
  );

  if (query.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="py-12 text-center text-sm text-ink-muted">
        Couldn&apos;t load this list.
      </p>
    );
  }
  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink-border text-ink-muted">
          <Users className="h-7 w-7" />
        </div>
        <p className="text-sm text-ink-muted">{emptyText}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {list.map((pk) => (
        <UserRow key={pk} pubkey={pk} />
      ))}
    </div>
  );
}

export function FollowingModal({
  pubkey,
  onClose,
}: {
  pubkey: string;
  onClose: () => void;
}) {
  const query = useFollowing(pubkey);
  return (
    <Modal onClose={onClose} title="Following" maxWidth="max-w-md">
      <FollowList query={query} emptyText="Not following anyone yet." />
    </Modal>
  );
}

export function FollowersModal({
  pubkey,
  onClose,
}: {
  pubkey: string;
  onClose: () => void;
}) {
  const query = useFollowers(pubkey);
  return (
    <Modal onClose={onClose} title="Followers" maxWidth="max-w-md">
      <FollowList query={query} emptyText="No followers yet." />
    </Modal>
  );
}
