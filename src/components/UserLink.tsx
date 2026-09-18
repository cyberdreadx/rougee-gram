import { Link } from "react-router-dom";
import { useProfile } from "@/hooks/useProfile";
import { useVerified } from "@/hooks/useVerified";
import VerifiedBadge from "@/components/VerifiedBadge";
import { displayName } from "@/lib/profile";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Links to a user's profile by their (resolved) rouge1 address, passing the
 *  pubkey through router state to skip a resolve round-trip. */
export function useUserLinkTarget(pubkey: string) {
  const { data } = useProfile(pubkey);
  const address = data?.address ?? "";
  return {
    to: address ? `/u/${address}` : "#",
    state: { pubkey },
    profile: data,
  };
}

export default function UserLink({
  pubkey,
  className,
  showHandle,
}: {
  pubkey: string;
  className?: string;
  showHandle?: boolean;
}) {
  const { to, state, profile } = useUserLinkTarget(pubkey);
  const name = profile ? displayName(profile) : shortAddress(pubkey, 8, 4);

  return (
    <Link
      to={to}
      state={state}
      className={cn("hover:underline", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {name}
      {showHandle && profile?.name && (
        <span className="ml-1 font-normal text-ink-muted">
          @{profile.handle}
        </span>
      )}
    </Link>
  );
}

/**
 * A user's name (linking to their profile) followed by the verified badge when
 * the account is verified. Use for author/display names; the wrapping inline-flex
 * keeps the name truncating while the badge stays visible.
 */
export function VerifiedName({
  pubkey,
  className,
  showHandle,
  badgeSize = 15,
}: {
  pubkey: string;
  className?: string;
  showHandle?: boolean;
  badgeSize?: number;
}) {
  const verified = useVerified(pubkey);
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 align-middle">
      <UserLink pubkey={pubkey} className={className} showHandle={showHandle} />
      {verified && <VerifiedBadge size={badgeSize} className="shrink-0" />}
    </span>
  );
}
