import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Globe,
  ExternalLink,
  Heart,
  Repeat2,
  MessageCircle,
  Send,
  Bookmark,
  X,
  MoreHorizontal,
  Ban,
  EyeOff,
} from "lucide-react";
import type { FeedPost } from "@/lib/nostrFeed";
import { timeAgo, shortAddress } from "@/lib/format";
import { useAuth } from "@/store/auth";
import { useToast } from "./Toast";
import { useActed, useNoteThread, useNostrSocial } from "@/hooks/useNostrFeed";
import { setFollow, setBookmark, setBlock } from "@/lib/nostrSocial";
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
import FeedVideo from "./FeedVideo";
import RichText from "./RichText";
import TranslateText from "./TranslateText";
import { recordTaste, tagsFromText, TASTE_WEIGHTS } from "@/lib/taste";

/**
 * A Nostr note mixed into the Discover feed. Identity/avatar come from the
 * note's kind-0 profile, media renders natively (https). Like / repost /
 * comment are published to Nostr with the viewer's own Nostr key (populated
 * with their rougee name + avatar the first time); value (tips) stays on
 * RougeChain.
 */
/** Clamp long Nostr note text (some notes are enormous hashtag/URL walls). */
const NOSTR_CLAMP = 280;

export default function NostrPostCard({ post }: { post: FeedPost }) {
  const { address, publicKey } = useAuth();
  const myProfile = useMyProfile();
  const acted = useActed()[post.id];
  const isSaved = useIsSaved(post.id);
  const toggleSave = useToggleSave();
  const { follows } = useNostrSocial();
  const [followBusy, setFollowBusy] = useState(false);
  const [brokenAvatar, setBrokenAvatar] = useState(false);
  const [busy, setBusy] = useState<null | "like" | "repost">(null);
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);
  const [brokenImgs, setBrokenImgs] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const { toast } = useToast();
  const [optimistic, setOptimistic] = useState<
    { id: string; pubkey: string; content: string; created_at: number; realId?: string }[]
  >([]);

  const { t } = useTranslation();
  const n = post.nostr;
  const owner = address || "anon";
  const bodyLong = post.body.length > NOSTR_CLAMP;
  const eventId = eventIdOf(post.id);
  const { replies, profiles: replyProfiles } = useNoteThread(eventId, showComments);

  // Replies + your just-sent (optimistic) ones, deduped once the relay echoes them back.
  const threadReplies = useMemo(() => {
    const realIds = new Set(replies.map((r) => r.id));
    const opt = optimistic.filter((o) => !o.realId || !realIds.has(o.realId));
    return [
      ...replies.map((r) => ({ id: r.id, pubkey: r.pubkey, content: r.content, created_at: r.created_at })),
      ...opt,
    ].sort((a, b) => a.created_at - b.created_at);
  }, [replies, optimistic]);

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
    // Taste signal for the personalized Discover re-rank (author keyed by nostr pubkey).
    recordTaste(publicKey, {
      author: n.pubkey,
      tags: tagsFromText(post.body),
      weight: TASTE_WEIGHTS.like,
      dedupeKey: `nlike:${post.id}`,
    });
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
    const tempId = `temp-${Date.now()}-${Math.random()}`;
    // Optimistic: show it immediately as "You".
    setOptimistic((prev) => [
      ...prev,
      { id: tempId, pubkey: "", content: text, created_at: Math.floor(Date.now() / 1000) },
    ]);
    setCommentText("");
    try {
      const ev = await publishEvent(owner, buildReply({ id: eventId, pubkey: n.pubkey }, text), await buildMeta());
      setOptimistic((prev) => prev.map((o) => (o.id === tempId ? { ...o, realId: ev.id } : o)));
    } catch {
      setOptimistic((prev) => prev.filter((o) => o.id !== tempId)); // failed → drop it
    } finally {
      setSending(false);
    }
  };

  const onSave = () => {
    const nowSaved = toggleSave(post.id); // local Saved collection
    setBookmark(owner, eventId, nowSaved).catch(() => {}); // + portable NIP-51 bookmark
  };
  const onFollow = async () => {
    if (!n) return;
    setFollowBusy(true);
    await setFollow(owner, n.pubkey, !follows.has(n.pubkey));
    setFollowBusy(false);
  };

  if (!n || dismissed) return null;
  const images = n.images.slice(0, 4).filter((u) => !brokenImgs.has(u)); // drop ones that 404 / aren't images
  const following = follows.has(n.pubkey);
  const videos = n.videos.slice(0, 2);
  const likeCount = Math.max(n.likeCount ?? 0, acted?.liked ? 1 : 0);
  const replyCount = Math.max(n.replyCount ?? 0, threadReplies.length);
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
        <button
          onClick={onFollow}
          disabled={followBusy}
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-60",
            following
              ? "border border-ink-border text-ink-muted"
              : "bg-rouge-600 text-white hover:bg-rouge-500",
          )}
        >
          {following ? "Following" : "Follow"}
        </button>
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="text-ink-muted hover:text-white"
            aria-label="More"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="glass absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl">
                <button
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-rouge-400 hover:bg-white/5"
                  onClick={async () => {
                    setMenuOpen(false);
                    setDismissed(true);
                    try {
                      await setBlock(owner, n.pubkey, true);
                      toast(`Blocked ${n.name}`, "success");
                    } catch {
                      toast("Couldn't block", "error");
                    }
                  }}
                >
                  <Ban className="h-4 w-4" /> Block {n.name}
                </button>
                <button
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5"
                  onClick={() => {
                    setMenuOpen(false);
                    setDismissed(true);
                  }}
                >
                  <EyeOff className="h-4 w-4" /> Hide this post
                </button>
                <a
                  href={n.noteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5"
                  onClick={() => setMenuOpen(false)}
                >
                  <ExternalLink className="h-4 w-4" /> View on Nostr
                </a>
              </div>
            </>
          )}
        </div>
      </div>

      {/* text — clamped with a more/less toggle (Nostr notes can be very long) */}
      {post.body.trim() && (
        <>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
            <RichText text={bodyLong && !expanded ? post.body.slice(0, NOSTR_CLAMP).trimEnd() : post.body} />
            {bodyLong &&
              (expanded ? (
                <>
                  {" "}
                  <button className="text-ink-muted hover:underline" onClick={() => setExpanded(false)}>
                    {t("common.less")}
                  </button>
                </>
              ) : (
                <>
                  …{" "}
                  <button className="text-ink-muted hover:underline" onClick={() => setExpanded(true)}>
                    {t("common.more")}
                  </button>
                </>
              ))}
          </p>
          <TranslateText text={post.body} className="mt-1" />
        </>
      )}

      {/* videos — same in-feed player as RougeChain posts: inline muted autoplay
          while on screen, tap = mute, double-tap = like, hold = pause. */}
      {videos.map((url) => (
        <NostrVideo
          key={url}
          url={url}
          liked={!!acted?.liked}
          onLike={() => {
            if (!acted?.liked && busy === null) like();
          }}
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
              onClick={() => setLightbox(url)}
              onError={() => setBrokenImgs((prev) => new Set(prev).add(url))}
              className={
                "w-full cursor-zoom-in object-cover " +
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
          onClick={onSave}
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
          {threadReplies.length === 0 ? (
            <p className="text-xs text-ink-muted">No comments yet — be the first.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {threadReplies.map((rep) => {
                const mine = !rep.pubkey; // optimistic / your just-sent reply
                const rp = mine ? undefined : replyProfiles.get(rep.pubkey);
                const rname = mine ? "You" : rp?.name?.trim() || shortNpub(rep.pubkey);
                return (
                  <div key={rep.id} className="flex gap-2.5 text-sm">
                    {mine ? (
                      <div className="shrink-0">
                        <Avatar seed="you" name="You" size={28} />
                      </div>
                    ) : (
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
                    )}
                    <div className="min-w-0 flex-1">
                      {mine ? (
                        <span className="font-semibold">You</span>
                      ) : (
                        <Link to={`/nostr/${rep.pubkey}`} className="font-semibold hover:underline">
                          {rname}
                        </Link>
                      )}{" "}
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

      {/* tap-to-expand lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
        >
          <img
            src={lightbox}
            alt=""
            className="max-h-[92vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </article>
  );
}

/**
 * A Nostr note's video, played with the same in-feed player as RougeChain posts
 * (FeedVideo: inline muted autoplay on screen, tap = mute, double-tap = like,
 * hold = pause). Nostr notes carry no dimensions, so the container sizes itself
 * from the video's intrinsic ratio once metadata loads (16:9 until then).
 */
function NostrVideo({ url, liked, onLike }: { url: string; liked: boolean; onLike: () => void }) {
  const [ar, setAr] = useState<number | null>(null);
  return (
    <div
      className="relative mt-3 w-full overflow-hidden rounded-xl bg-black"
      style={{ aspectRatio: ar ?? 16 / 9, maxHeight: "70vh" }}
    >
      <FeedVideo
        refUri={url}
        liked={liked}
        onLike={onLike}
        onLoadedMeta={(w, h) => h > 0 && setAr(w / h)}
      />
    </div>
  );
}
