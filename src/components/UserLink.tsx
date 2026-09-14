import { Link } from "react-router-dom";
import { useProfile } from "@/hooks/useProfile";
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
