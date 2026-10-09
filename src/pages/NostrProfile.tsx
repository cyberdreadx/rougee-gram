import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Globe, ExternalLink, Loader2, Link as LinkIcon, UserPlus, UserCheck, Ban } from "lucide-react";
import { useNostrAuthor, useNostrSocial } from "@/hooks/useNostrFeed";
import { npub, shortNpub } from "@/lib/nostrAuth";
import { loadNostrLists, setFollow, setBlock } from "@/lib/nostrSocial";
import { useAuth } from "@/store/auth";
import { cn } from "@/lib/utils";
import NostrPostCard from "@/components/NostrPostCard";
import Avatar from "@/components/Avatar";

/**
 * A Nostr author's profile, viewed inside rougee-gram: their kind-0 identity +
 * recent notes. Reached by tapping a Nostr author's name/avatar in the feed.
 */
export default function NostrProfile() {
  const { pubkey } = useParams<{ pubkey: string }>();
  const { notes, profile, loading } = useNostrAuthor(pubkey);

  const { address } = useAuth();
  const owner = address || "anon";
  const { follows, mutes } = useNostrSocial();
  const [busy, setBusy] = useState<null | "follow" | "block">(null);
  useEffect(() => {
    loadNostrLists(owner);
  }, [owner]);

  const following = !!(pubkey && follows.has(pubkey));
  const blocked = !!(pubkey && mutes.has(pubkey));
  const toggleFollow = async () => {
    if (!pubkey) return;
    setBusy("follow");
    await setFollow(owner, pubkey, !following);
    setBusy(null);
  };
  const toggleBlock = async () => {
    if (!pubkey) return;
    setBusy("block");
    await setBlock(owner, pubkey, !blocked);
    setBusy(null);
  };

  const name = profile?.name?.trim() || (pubkey ? shortNpub(pubkey) : "");
  const njump = pubkey ? `https://njump.me/${npub(pubkey)}` : "#";

  return (
    <div>
      <div className="sticky top-0 z-20 flex items-center gap-3 border-b border-ink-border bg-ink/55 px-4 py-3 backdrop-blur">
        <Link to="/" aria-label="Back" className="text-ink-muted hover:text-ink">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="truncate font-semibold">{name}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink-border px-1.5 py-px text-[10px] text-ink-muted">
          <Globe className="h-2.5 w-2.5" /> Nostr
        </span>
      </div>

      {profile?.banner && (
        <img src={profile.banner} alt="" className="h-28 w-full object-cover" />
      )}

      <div className="flex items-start gap-4 px-4 py-4">
        {profile?.picture ? (
          <img
            src={profile.picture}
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover"
          />
        ) : (
          <Avatar seed={pubkey ?? ""} name={name} size={64} />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">{name}</div>
          {profile?.nip05 && (
            <div className="truncate text-xs text-ink-muted">
              {profile.nip05.replace(/^_@/, "")}
            </div>
          )}
          {profile?.about && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-muted">
              {profile.about}
            </p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
            {profile?.website && (
              <a
                href={profile.website}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-ink"
              >
                <LinkIcon className="h-3.5 w-3.5" />
                {profile.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
              </a>
            )}
            <a
              href={njump}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-ink"
            >
              <ExternalLink className="h-3.5 w-3.5" /> View on Nostr
            </a>
          </div>
        </div>
      </div>

      <div className="flex gap-2 px-4 pb-4">
        <button
          onClick={toggleFollow}
          disabled={busy !== null}
          className={cn(
            "flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition disabled:opacity-60",
            following
              ? "border border-ink-border text-ink hover:border-rose-500/50 hover:text-rose-400"
              : "bg-rouge-600 text-white hover:bg-rouge-500",
          )}
        >
          {following ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {following ? "Following" : "Follow"}
        </button>
        <button
          onClick={toggleBlock}
          disabled={busy !== null}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm font-semibold transition disabled:opacity-60",
            blocked
              ? "border-rose-500/60 text-rose-400"
              : "border-ink-border text-ink-muted hover:text-ink",
          )}
        >
          <Ban className="h-4 w-4" />
          {blocked ? "Unblock" : "Block"}
        </button>
      </div>

      <div className="border-t border-ink-border">
        {loading && notes.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        ) : notes.length === 0 ? (
          <p className="px-4 py-16 text-center text-sm text-ink-muted">No posts yet.</p>
        ) : (
          notes.map((p) => <NostrPostCard key={p.id} post={p} />)
        )}
      </div>
    </div>
  );
}
