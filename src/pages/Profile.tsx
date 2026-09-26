import { useState } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import {
  Loader2,
  Settings,
  Share2,
  Check,
  Send,
  Grid3x3,
  Clapperboard,
  UserSquare,
  Bookmark,
  AlignLeft,
  Link2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { useResolvePubkey } from "@/hooks/useResolve";
import { useProfile } from "@/hooks/useProfile";
import { useUserPosts, useArtistStats, useToggleFollow } from "@/hooks/useSocial";
import { useStartConversation } from "@/hooks/useMessenger";
import { useSavedPosts } from "@/hooks/useSaved";
import TipButton from "@/components/TipButton";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import PhotoGrid, { toPhotoCells } from "@/components/PhotoGrid";
import { TextPostCard } from "@/components/PostCard";
import EditProfile from "@/components/EditProfile";
import BlockButton from "@/components/BlockButton";
import NoteEditor from "@/components/NoteEditor";
import { FollowingModal, FollowersModal } from "@/components/FollowListModal";
import { latestActiveNote, type Note } from "@/hooks/useNotes";
import { useVerified } from "@/hooks/useVerified";
import VerifiedBadge from "@/components/VerifiedBadge";
import Handle from "@/components/Handle";
import { DMS_ENABLED } from "@/lib/features";
import { Plus } from "lucide-react";

/** Display host for a link chip (drops the www. and scheme). */
function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
import { decodeBody } from "@/lib/envelope";
import { displayName, type Profile as ProfileData } from "@/lib/profile";
import { shortAddress, formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

type ProfileTab = "posts" | "text" | "reels" | "tagged" | "saved";

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
  const verified = useVerified(pubkey || undefined);
  const [tab, setTab] = useState<ProfileTab>("posts");
  const [followList, setFollowList] = useState<null | "following" | "followers">(null);
  const [showNote, setShowNote] = useState(false);

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
  const note = latestActiveNote(posts.data?.posts, pubkey);

  return (
    <div className="pb-8">
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center justify-between border-b border-ink-border bg-ink/80 px-4 py-3 backdrop-blur md:top-0">
        <h1 className="truncate text-base font-semibold">
          {profile ? displayName(profile) : shortAddress(address ?? "")}
        </h1>
        {isMe && (
          <button
            className="btn-ghost h-10 w-10 p-0"
            onClick={() => navigate("/settings")}
            aria-label="Settings"
          >
            <Settings className="h-5 w-5" />
          </button>
        )}
      </header>

      {/* Profile head — extra top padding leaves room for the note bubble that
          floats above the avatar so it clears the sticky header (see ProfileNote). */}
      <div className="px-4 pb-5 pt-14">
        <div className="flex items-center gap-5">
          <ProfileNote
            note={note}
            isMe={isMe}
            avatarRef={profile?.avatarRef}
            seed={pubkey}
            name={profile?.name}
            onEdit={() => setShowNote(true)}
          />
          <div className="flex flex-1 justify-around text-center">
            <Stat label="Posts" value={photoCount} />
            <Stat
              label="Followers"
              value={stats.data?.followers ?? 0}
              onClick={pubkey ? () => setFollowList("followers") : undefined}
            />
            <Stat
              label="Following"
              value={stats.data?.following ?? 0}
              onClick={pubkey ? () => setFollowList("following") : undefined}
            />
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center gap-1 font-semibold">
            <span>{profile ? displayName(profile) : shortAddress(address ?? "")}</span>
            {verified && <VerifiedBadge size={18} />}
          </div>
          <Handle pubkey={pubkey} className="text-sm" />
          <div className="font-mono text-sm text-ink-muted">
            {shortAddress(profile?.address ?? address ?? "", 14, 8)}
          </div>
          {profile?.bio && (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {profile.bio}
            </p>
          )}
          {profile?.links && profile.links.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {profile.links.map((l) => (
                <a
                  key={l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-ink-soft px-3 py-1.5 text-sm font-medium text-rouge-400 hover:bg-ink-border"
                >
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{l.label || linkHost(l.url)}</span>
                </a>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          {isMe ? (
            <EditProfileButton profile={profile} />
          ) : (
            <>
              <FollowButton pubkey={pubkey} isFollowing={stats.data?.isFollowing} />
              {DMS_ENABLED && <MessageButton pubkey={pubkey} />}
            </>
          )}
          <TipButton
            toAddress={profile?.address ?? address}
            toName={profile?.name}
            className="btn-soft flex h-10 w-11 shrink-0 items-center justify-center p-0"
            iconClassName="h-4 w-4"
          />
          <ShareProfileButton address={profile?.address ?? address ?? ""} />
          {!isMe && pubkey && <BlockButton pubkey={pubkey} />}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-t border-ink-border">
        <TabButton active={tab === "posts"} onClick={() => setTab("posts")} icon={Grid3x3} label="Posts" />
        <TabButton active={tab === "text"} onClick={() => setTab("text")} icon={AlignLeft} label="Text posts" />
        <TabButton active={tab === "reels"} onClick={() => setTab("reels")} icon={Clapperboard} label="Reels" />
        <TabButton active={tab === "tagged"} onClick={() => setTab("tagged")} icon={UserSquare} label="Tagged" />
        {isMe && (
          <TabButton active={tab === "saved"} onClick={() => setTab("saved")} icon={Bookmark} label="Saved" />
        )}
      </div>

      {/* Tab content */}
      <div className="p-0.5 sm:p-1">
        {tab === "posts" && (
          <PhotoGrid posts={posts.data?.posts} isLoading={posts.isLoading} />
        )}
        {tab === "text" && (
          <TextPostList
            posts={posts.data?.posts}
            isLoading={posts.isLoading}
            profile={profile}
          />
        )}
        {tab === "reels" && (
          <PhotoGrid
            posts={posts.data?.posts}
            isLoading={posts.isLoading}
            only="reels"
            emptyLabel="No reels yet."
          />
        )}
        {tab === "tagged" && <TaggedEmpty />}
        {tab === "saved" && isMe && <SavedGrid />}
      </div>

      {followList === "following" && pubkey && (
        <FollowingModal pubkey={pubkey} onClose={() => setFollowList(null)} />
      )}
      {followList === "followers" && pubkey && (
        <FollowersModal pubkey={pubkey} onClose={() => setFollowList(null)} />
      )}

      {showNote && isMe && (
        <NoteEditor note={note} onClose={() => setShowNote(false)} />
      )}
    </div>
  );
}

/** Avatar with an Instagram-style 24h "note" bubble floating above it. Tappable
 *  to set/clear on your own profile; read-only on others'. */
function ProfileNote({
  note,
  isMe,
  avatarRef,
  seed,
  name,
  onEdit,
}: {
  note: Note | null;
  isMe: boolean;
  avatarRef?: string;
  seed: string;
  name?: string;
  onEdit: () => void;
}) {
  const showChip = Boolean(note) || isMe;
  const inner = (
    <>
      {showChip && (
        <div className="absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2">
          <div className="relative max-w-[120px] rounded-2xl rounded-bl-sm bg-ink-card px-3 py-1.5 text-center text-[11px] leading-tight shadow-lg">
            {note ? (
              <span className="line-clamp-2 text-white">{note.text}</span>
            ) : (
              <span className="text-ink-muted">Note…</span>
            )}
            <span className="absolute -bottom-1 left-3 h-2 w-2 rounded-full bg-ink-card" />
          </div>
        </div>
      )}
      <Avatar refUri={avatarRef} seed={seed} name={name} size={84} />
      {isMe && !note && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-rouge-600 ring-2 ring-ink">
          <Plus className="h-3.5 w-3.5 text-white" />
        </span>
      )}
    </>
  );

  if (isMe) {
    return (
      <button
        type="button"
        onClick={onEdit}
        className="relative shrink-0"
        aria-label="Edit your note"
      >
        {inner}
      </button>
    );
  }
  return <div className="relative shrink-0">{inner}</div>;
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center border-t-2 py-3 transition-colors",
        active
          ? "border-white text-white"
          : "border-transparent text-ink-muted hover:text-white",
      )}
      aria-label={label}
      aria-selected={active}
      role="tab"
    >
      <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 2} />
    </button>
  );
}

/** Top-level plain-text posts (thread roots and standalone text posts) as a
 *  scrolling list — the media grid can't represent them. Continuation parts and
 *  comments (which carry `reply_to_id`) are excluded; a thread shows as its root
 *  and expands on the detail page. */
function TextPostList({
  posts,
  isLoading,
  profile,
}: {
  posts?: SocialPost[];
  isLoading: boolean;
  profile?: ProfileData;
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    );
  }
  const texts = (posts ?? []).filter(
    (p) => !p.reply_to_id && decodeBody(p.body).kind === "text",
  );
  if (texts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink-border text-ink-muted">
          <AlignLeft className="h-7 w-7" />
        </div>
        <div>
          <h3 className="font-semibold">No text posts yet</h3>
          <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
            Text posts and threads will show up here.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-[620px] px-3 sm:px-0">
      {texts.map((p) => (
        <TextPostCard key={p.id} post={p} profile={profile} />
      ))}
    </div>
  );
}

function SavedGrid() {
  const saved = useSavedPosts();
  return (
    <PhotoGrid
      posts={saved.data}
      isLoading={saved.isLoading}
      emptyLabel="Save posts to find them here later."
    />
  );
}

function TaggedEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink-border text-ink-muted">
        <UserSquare className="h-7 w-7" />
      </div>
      <div>
        <h3 className="font-semibold">No tagged posts</h3>
        <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
          When people tag this account in a post, it&apos;ll show up here.
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  onClick,
}: {
  label: string;
  value: number;
  onClick?: () => void;
}) {
  const inner = (
    <>
      <div className="text-lg font-bold">{formatCount(value)}</div>
      <div className="text-xs text-ink-muted">{label}</div>
    </>
  );
  if (!onClick) return <div>{inner}</div>;
  return (
    <button
      onClick={onClick}
      className="rounded-lg transition-colors hover:bg-white/5"
      aria-label={`View ${label.toLowerCase()}`}
    >
      {inner}
    </button>
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

function MessageButton({ pubkey }: { pubkey: string }) {
  const start = useStartConversation();
  const navigate = useNavigate();
  const { toast } = useToast();
  return (
    <button
      className="btn-soft flex-1"
      disabled={start.isPending}
      onClick={() =>
        start.mutate([pubkey], {
          onSuccess: (id) => navigate(`/messages/${id}`),
          onError: (e) => toast(e instanceof Error ? e.message : "Failed", "error"),
        })
      }
    >
      {start.isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <>
          <Send className="h-4 w-4" /> Message
        </>
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
