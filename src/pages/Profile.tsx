import { useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { Loader2, Settings, Share2, Check } from "lucide-react";
import { useResolvePubkey } from "@/hooks/useResolve";
import { useProfile } from "@/hooks/useProfile";
import { useUserPosts, useArtistStats, useToggleFollow } from "@/hooks/useSocial";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import PhotoGrid, { toPhotoCells } from "@/components/PhotoGrid";
import EditProfile from "@/components/EditProfile";
import { displayName } from "@/lib/profile";
import { shortAddress, formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Profile() {
  const { address } = useParams<{ address: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const knownPubkey = (location.state as { pubkey?: string } | null)?.pubkey;
  const { publicKey: myPubkey } = useAuth();

  const resolved = useResolvePubkey(address, knownPubkey);
  const pubkey = resolved.data?.publicKey || knownPubkey || "";

  const { data: profile } = useProfile(pubkey || undefined);
  const stats = useArtistStats(pubkey || undefined);
  const posts = useUserPosts(pubkey || undefined);

  const isMe = Boolean(pubkey) && pubkey === myPubkey;

  if (resolved.isLoading && !pubkey) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    );
  }

  if (!pubkey) {
    return (
      <div className="py-20 text-center text-sm text-ink-muted">
        Couldn't find that account.
      </div>
    );
  }

  const photoCount = toPhotoCells(posts.data?.posts).length;

  return (
    <div className="pb-8">
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center justify-between border-b border-ink-border bg-ink/80 px-4 py-3 backdrop-blur md:top-0">
        <h1 className="truncate text-base font-semibold">
          {profile ? displayName(profile) : shortAddress(address ?? "")}
        </h1>
        {isMe && (
          <button className="btn-ghost h-10 w-10 p-0" onClick={() => navigate("/settings")}>
            <Settings className="h-5 w-5" />
          </button>
        )}
      </header>

      {/* Profile head */}
      <div className="px-4 py-5">
        <div className="flex items-center gap-5">
          <Avatar
            refUri={profile?.avatarRef}
            seed={pubkey}
            name={profile?.name}
            size={84}
          />
          <div className="flex flex-1 justify-around text-center">
            <Stat label="Posts" value={photoCount} />
            <Stat label="Followers" value={stats.data?.followers ?? 0} />
            <Stat label="Following" value={stats.data?.following ?? 0} />
          </div>
        </div>

        <div className="mt-4">
          <div className="font-semibold">
            {profile ? displayName(profile) : shortAddress(address ?? "")}
          </div>
          <div className="text-sm text-ink-muted">
            {shortAddress(profile?.address ?? address ?? "", 14, 8)}
          </div>
          {profile?.bio && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {profile.bio}
            </p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          {isMe ? (
            <EditProfileButton profile={profile} />
          ) : (
            <FollowButton pubkey={pubkey} isFollowing={stats.data?.isFollowing} />
          )}
          <ShareProfileButton address={profile?.address ?? address ?? ""} />
        </div>
      </div>

      {/* Grid */}
      <div className="border-t border-ink-border p-0.5 sm:p-1">
        <PhotoGrid posts={posts.data?.posts} isLoading={posts.isLoading} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-lg font-bold">{formatCount(value)}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </div>
  );
}

function FollowButton({
  pubkey,
  isFollowing,
}: {
  pubkey: string;
  isFollowing?: boolean;
}) {
  const follow = useToggleFollow(pubkey);
  const { toast } = useToast();
  return (
    <button
      className={cn("flex-1", isFollowing ? "btn-soft" : "btn-primary")}
      disabled={follow.isPending}
      onClick={() =>
        follow.mutate(undefined, {
          onError: (e) =>
            toast(e instanceof Error ? e.message : "Failed", "error"),
        })
      }
    >
      {follow.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isFollowing ? (
        "Following"
      ) : (
        "Follow"
      )}
    </button>
  );
}

function EditProfileButton({ profile }: { profile?: import("@/lib/profile").Profile }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn-soft flex-1" onClick={() => setOpen(true)} disabled={!profile}>
        Edit profile
      </button>
      {open && profile && <EditProfile profile={profile} onClose={() => setOpen(false)} />}
    </>
  );
}

function ShareProfileButton({ address }: { address: string }) {
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  function share() {
    const url = `${location.origin}/u/${address}`;
    navigator.clipboard.writeText(url);
    setDone(true);
    toast("Profile link copied", "success");
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <button className="btn-soft h-10 w-11 shrink-0 p-0" onClick={share} aria-label="Share profile">
      {done ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
    </button>
  );
}
