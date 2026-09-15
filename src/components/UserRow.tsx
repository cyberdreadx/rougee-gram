import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { useArtistStats, useToggleFollow } from "@/hooks/useSocial";
import { useAuth } from "@/store/auth";
import { displayName } from "@/lib/profile";
import { shortAddress } from "@/lib/format";
import Avatar from "./Avatar";
import { cn } from "@/lib/utils";

export default function UserRow({
  pubkey,
  subtitle,
  showFollow = true,
}: {
  pubkey: string;
  subtitle?: string;
  showFollow?: boolean;
}) {
  const { publicKey } = useAuth();
  const { data: profile } = useProfile(pubkey);
  const stats = useArtistStats(showFollow ? pubkey : undefined);
  const follow = useToggleFollow(pubkey);
  const isMe = pubkey === publicKey;

  const name = profile ? displayName(profile) : shortAddress(pubkey, 8, 4);
  const to = profile?.address ? `/u/${profile.address}` : "#";
  const sub = subtitle ?? shortAddress(profile?.address ?? "", 10, 5);

  return (
    <div className="flex items-center gap-3">
      <Link to={to} state={{ pubkey }} className="shrink-0">
        <Avatar refUri={profile?.avatarRef} seed={pubkey} name={profile?.name} size={40} />
      </Link>
      <Link to={to} state={{ pubkey }} className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold hover:underline">{name}</div>
        <div className="truncate text-xs text-ink-muted">{sub}</div>
      </Link>
      {showFollow && !isMe && (
        <button
          className={cn(
            "shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-colors",
            stats.data?.isFollowing
              ? "bg-white/5 text-white hover:bg-white/10"
              : "bg-rouge-600 text-white hover:bg-rouge-500",
          )}
          disabled={follow.isPending}
          onClick={() => follow.mutate()}
        >
          {follow.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : stats.data?.isFollowing ? (
            "Following"
          ) : (
            "Follow"
          )}
        </button>
      )}
    </div>
  );
}
