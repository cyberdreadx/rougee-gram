import { useState } from "react";
import { Link } from "react-router-dom";
import { Globe, ExternalLink, Heart, Repeat2, MessageCircle, Send, Bookmark } from "lucide-react";
import type { FeedPost } from "@/lib/nostrFeed";
import { timeAgo, shortAddress } from "@/lib/format";
import { useAuth } from "@/store/auth";
import { useActed, useNoteThread } from "@/hooks/useNostrFeed";
import { useMyProfile } from "@/hooks/useProfile";
import {
  buildReaction,
  buildRepost,
  buildReply,
  publishEvent,
  markActed,
  eventIdOf,
  shortNpub,
} from "@/lib/nostrAuth";
import { useIsSaved, useToggleSave } from "@/hooks/useSaved";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";
import Avatar from "./Avatar";
import RichText from "./RichText";

/**
 * A Nostr note mixed into the Discover feed. Identity/avatar come from the
 * note's kind-0 profile, media renders natively (https). Like / repost /
 * comment are published to Nostr with the viewer's own Nostr key (populated
 * with their rougee name + avatar the first time); value (tips) stays on
 * RougeChain.
 */
export default function NostrPostCard({ post }: { post: FeedPost }) {
  const { address } = useAuth();
  const myProfile = useMyProfile();
  const acted = useActed()[post.id];
  const isSaved = useIsSaved(post.id);
  const toggleSave = useToggleSave();
  const [brokenAvatar, setBrokenAvatar] = useState(false);
  const [busy, setBusy] = useState<null | "like" | "repost">(null);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);

  const n = post.nostr;
  const owner = address || "anon";
  const eventId = eventIdOf(post.id);
  const { replies, profiles: replyProfiles } = useNoteThread(eventId, showComments);

  // Populate the viewer's Nostr identity from their rougee profile on first use.
  // Resolving the avatar must never throw — it would otherwise block the action.
  const buildMeta = async (): Promise<{ name?: string; picture?: string }> => {
    let picture: string | undefined;
    try {
      if (myProfile?.avatarRef) picture = (await resolveMediaUrl(myProfile.avatarRef)) ?? undefined;
    } catch {
      /* avatar is optional */
    }
    return {
      name: myProfile?.name?.trim() || (address ? shortAddress(address) : undefined),
      picture,
    };
  };

  const like = async () => {
    if (!n || acted?.liked || busy) return;
    setBusy("like");
    markActed(post.id, "liked"); // optimistic — the heart fills instantly
    try {
      await publishEvent(owner, buildReaction({ id: eventId, pubkey: n.pubkey }), await buildMeta());
    } catch (e) {
      console.warn("[nostr] like failed", e);
    } finally {
      setBusy(null);
    }
  };

  const repost = async () => {
    if (!n || acted?.reposted || busy) return;
    setBusy("repost");
    markActed(post.id, "reposted"); // optimistic
    try {
      await publishEvent(owner, buildRepost({ id: eventId, pubkey: n.pubkey }), await buildMeta());
    } catch (e) {
      console.warn("[nostr] repost failed", e);
    } finally {
      setBusy(null);
    }
  };

  const sendComment = async () => {
    const text = commentText.trim();
    if (!n || !text || sending) return;
    setSending(true);
    try {
      await publishEvent(owner, buildReply({ id: eventId, pubkey: n.pubkey }, text), await buildMeta());
      setCommentText(""); // the thread subscription surfaces it once relays echo it back
    } catch {
      /* relay rejected */
    } finally {
      setSending(false);
    }
  };

  if (!n) return null;
  const images = n.images.slice(0, 4);
  const videos = n.videos.slice(0, 2);
  const likeCount = Math.max(n.likeCount ?? 0, acted?.liked ? 1 : 0);
  const replyCount = Math.max(n.replyCount ?? 0, replies.length);
  const repostCount = Math.max(n.repostCount ?? 0, acted?.reposted ? 1 : 0);

  return (
    <article className="border-b border-ink-border px-4 py-3">
      {/* header */}
      <div className="flex items-center gap-3">
        <Link to={`/nostr/${n.pubkey}`} className="shrink-0" aria-label={`${n.name} on Nostr`}>
          {n.avatar && !brokenAvatar ? (
            <img
              src={n.avatar}
              alt=""
              loading="lazy"
              onError={() => setBrokenAvatar(true)}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <Avatar seed={n.pubkey} name={n.name} size={40} />
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Link to={`/nostr/${n.pubkey}`} className="truncate text-sm font-semibold hover:underline">
              {n.name}
            </Link>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink-border px-1.5 py-px text-[10px] text-ink-muted">
              <Globe className="h-2.5 w-2.5" /> Nostr
            </span>
          </div>
          <div className="text-xs text-ink-muted">{timeAgo(post.created_at)}</div>
        </div>
      </div>

      {/* text */}
      {post.body.trim() && (
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
          <RichText text={post.body} />
        </p>
      )}

      {/* videos — play inline, in-app */}
      {videos.map((url) => (
        <video
          key={url}
          src={url}
          controls
          playsInline
          preload="metadata"
          className="mt-3 max-h-[70vh] w-full rounded-xl bg-black"
        />
      ))}

      {/* images */}
      {images.length > 0 && (
        <div
          className={
            "mt-3 overflow-hidden rounded-xl " +
            (images.length === 1 ? "" : "grid grid-cols-2 gap-0.5")
          }
        >
          {images.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              loading="lazy"
              className={
                "w-full object-cover " +
                (images.length === 1 ? "max-h-[70vh]" : "aspect-square")
              }
            />
          ))}
        </div>
      )}

      {/* actions — published to Nostr with the viewer's own key */}
      <div className="mt-3 flex items-center gap-5 text-ink-muted">
        <button
          onClick={like}
          disabled={busy !== null || acted?.liked}
          className={cn(
            "flex items-center gap-1.5 text-sm transition-colors hover:text-rose-400 disabled:opacity-70",
            acted?.liked && "text-rose-500",
          )}
          aria-label="Like on Nostr"
        >
          <Heart className={cn("h-5 w-5", acted?.liked && "fill-current")} />
          {likeCount > 0 && <span className="text-xs">{likeCount}</span>}
        </button>
        <button
          onClick={() => setShowComments((v) => !v)}
          className={cn(
            "flex items-center gap-1.5 text-sm transition-colors hover:text-sky-400",
            showComments && "text-sky-400",
          )}
          aria-label="Comments"
        >
          <MessageCircle className="h-5 w-5" />
          {replyCount > 0 && <span className="text-xs">{replyCount}</span>}
        </button>
        <button
          onClick={repost}
          disabled={busy !== null || acted?.reposted}
          className={cn(
            "flex items-center gap-1.5 text-sm transition-colors hover:text-emerald-400 disabled:opacity-70",
            acted?.reposted && "text-emerald-500",
          )}
          aria-label="Repost on Nostr"
        >
          <Repeat2 className="h-5 w-5" />
          {repostCount > 0 && <span className="text-xs">{repostCount}</span>}
        </button>
        <button
          onClick={() => toggleSave(post.id)}
          className={cn("transition-colors hover:text-amber-400", isSaved && "text-amber-400")}
          aria-label={isSaved ? "Remove from saved" : "Save"}
        >
          <Bookmark className={cn("h-5 w-5", isSaved && "fill-current")} />
        </button>
        <a
          href={n.noteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 text-xs hover:text-ink"
        >
          <ExternalLink className="h-3.5 w-3.5" /> View on Nostr
        </a>
      </div>

      {/* comments (Nostr replies) */}
      {showComments && (
        <div className="mt-3 border-t border-ink-border pt-3">
          {replies.length === 0 ? (
            <p className="text-xs text-ink-muted">No comments yet — be the first.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {replies.map((rep) => {
                const rp = replyProfiles.get(rep.pubkey);
                const rname = rp?.name?.trim() || shortNpub(rep.pubkey);
                return (
                  <div key={rep.id} className="flex gap-2.5 text-sm">
                    <Link to={`/nostr/${rep.pubkey}`} className="shrink-0">
                      {rp?.picture ? (
                        <img
                          src={rp.picture}
                          alt=""
                          loading="lazy"
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <Avatar seed={rep.pubkey} name={rname} size={28} />
                      )}
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/nostr/${rep.pubkey}`} className="font-semibold hover:underline">
                        {rname}
                      </Link>{" "}
                      <span className="whitespace-pre-wrap break-words">
                        <RichText text={rep.content} />
                      </span>
                      <div className="text-[10px] text-ink-muted">{timeAgo(rep.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-3 flex items-center gap-2">
            <input
              className="flex-1 rounded-full border border-ink-border bg-transparent px-3 py-1.5 text-sm outline-none focus:border-rouge-500"
              placeholder="Add a comment…"
              value={commentText}
              maxLength={500}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendComment();
              }}
            />
            <button
              onClick={sendComment}
              disabled={sending || !commentText.trim()}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rouge-600 text-white transition hover:bg-rouge-500 disabled:opacity-50"
              aria-label="Send comment"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
