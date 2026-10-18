import { useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Heart,
  MessageCircle,
  Repeat2,
  Share2,
  MoreHorizontal,
  Trash2,
  Check,
  Coins,
  Rocket,
  ChevronRight,
  Plus,
  Pin,
  PinOff,
} from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { decodeBody, postOptions, postCta, isMediaBody, type RepostEnvelope } from "@/lib/envelope";
import { useProfile, usePinPost } from "@/hooks/useProfile";
import {
  usePost,
  usePostStats,
  usePostTips,
  useToggleLike,
  useDeletePost,
  useShareCount,
  useRecordShare,
  useAddToStory,
  useArtistStats,
  useToggleFollow,
  usePostLikers,
} from "@/hooks/useSocial";
import { canShareToStory } from "@/lib/shareToStory";
import { recordTaste, tagsFromText, TASTE_WEIGHTS } from "@/lib/taste";
import { isGatedRef } from "@/lib/subs";
import GatedMedia from "./GatedMedia";
import RepostButton from "./RepostButton";
import Modal from "./Modal";
import type { Tipper } from "@/lib/tips";
import { useAuth } from "@/store/auth";
import { useToast } from "./Toast";
import { shortAddress, timeAgo, formatCount } from "@/lib/format";
import Avatar from "./Avatar";
import MediaImage from "./MediaImage";
import Carousel from "./Carousel";
import { VerifiedName } from "./UserLink";
import SaveButton from "./SaveButton";
import TipButton from "./TipButton";
import Handle from "./Handle";
import RichText from "./RichText";
import TranslateText from "./TranslateText";
import BoostModal from "./BoostModal";
import { promoteEnabled, recordClick } from "@/lib/promote";
import Caption from "./Caption";
import FeedVideo from "./FeedVideo";
import { Film, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export default function PostCard({
  post,
  embedded = false,
}: {
  post: SocialPost;
  /** Rendered inside another card (a repost) — drop the feed separator border. */
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const { publicKey } = useAuth();
  const decoded = decodeBody(post.body);
  const cta = postCta(post);
  const { data: profile } = useProfile(post.author_pubkey);
  const { data: stats } = usePostStats(post.id);
  const like = useToggleLike(post.id);
  const navigate = useNavigate();
  const [burst, setBurst] = useState(false);
  const lastTap = useRef(0);

  // photo / video / carousel render as media cards; plain text as text.
  // profile-metadata, story, and note posts are never shown as feed cards.
  if (
    decoded.kind === "profile" ||
    decoded.kind === "story" ||
    decoded.kind === "note" ||
    decoded.kind === "highlight"
  ) {
    return null;
  }
  if (decoded.kind === "repost") {
    return <RepostCard post={post} data={decoded.data} />;
  }
  if (decoded.kind === "text") {
    return <TextPostCard post={post} profile={profile} embedded={embedded} />;
  }

  const { hideLikes, noComments, location } = postOptions(decoded);

  const isCarousel = decoded.kind === "carousel";
  const carouselItems = decoded.kind === "carousel" ? decoded.data.items : null;
  const first = decoded.kind === "carousel" ? decoded.data.items[0] : null;
  const media = (
    decoded.kind === "carousel"
      ? {
          cid: first?.cid ?? "",
          mime: first?.mime ?? "image",
          w: first?.w,
          h: first?.h,
          cap: decoded.data.cap,
          alt: decoded.data.alt,
        }
      : decoded.data
  ) as {
    cid: string;
    mime?: string;
    w?: number;
    h?: number;
    cap?: string;
    alt?: string;
    poster?: string;
    t?: string;
    start?: number;
    end?: number;
    crop?: string;
  };
  const isVideo =
    !isCarousel && ((media.mime ?? "").startsWith("video/") || decoded.kind === "video");
  const isReel = decoded.kind === "video" && media.t === "reel";
  const posterRef = isVideo ? media.poster : undefined;
  const cropped = media.crop === "9:16";
  const liked = stats?.liked ?? false;
  // Reserve the media's real aspect ratio so the feed doesn't jump when it loads.
  // Carousels use one fixed 4:5 frame (Instagram-style): slides have mixed
  // ratios, so a single portrait-friendly frame + object-contain shows each one
  // fully (no per-slide zoom/crop) instead of cropping everything to slide 1.
  const aspectRatio = cropped
    ? "9 / 16"
    : isCarousel
      ? "4 / 5"
      : media.w && media.h
        ? `${media.w} / ${media.h}`
        : "1 / 1";

  function triggerLike() {
    if (!liked) {
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
      // Liking is a strong taste signal — feeds the personalized Discover re-rank.
      recordTaste(publicKey, {
        author: post.author_pubkey,
        tags: tagsFromText(media.cap),
        weight: TASTE_WEIGHTS.like,
        dedupeKey: `like:${post.id}`,
      });
    }
    like.mutate();
  }

  function onImageTap() {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (!liked) triggerLike();
    }
    lastTap.current = now;
  }

  return (
    <article
      className={cn("animate-fade-in py-3 sm:py-4", !embedded && "border-b border-ink-border/60")}
    >
      {/* header */}
      <header className="flex items-center gap-3 px-3 sm:px-0">
        <button onClick={() => navigate(profileTarget(profile?.address))}>
          <Avatar
            refUri={profile?.avatarRef}
            seed={post.author_pubkey}
            name={profile?.name}
            size={38}
          />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <span className="flex items-center gap-1.5 truncate">
            <VerifiedName
              pubkey={post.author_pubkey}
              className="truncate text-sm font-semibold"
            />
            <Handle pubkey={post.author_pubkey} className="shrink-0 text-xs" />
          </span>
          {location ? (
            <button
              onClick={() => navigate(`/location/${encodeURIComponent(location)}`)}
              className="flex items-center gap-1 truncate text-xs text-white/90 hover:underline"
            >
              <MapPin className="h-3 w-3 shrink-0 text-rouge-400" />
              <span className="truncate">{location}</span>
            </button>
          ) : null}
          <div className="truncate text-xs text-ink-muted">
            <span className="font-mono">{shortAddress(profile?.address ?? "", 10, 5)}</span> · {timeAgo(post.created_at)}
          </div>
        </div>
        <FollowPill pubkey={post.author_pubkey} />
        <PostMenu post={post} />
      </header>

      {/* media */}
      <div
        className="relative mt-3 max-h-[85vh] w-full select-none overflow-hidden bg-black sm:rounded-2xl"
        style={{ aspectRatio }}
        onClick={isVideo || isCarousel ? undefined : onImageTap}
        onDoubleClick={isVideo || isCarousel ? undefined : () => !liked && triggerLike()}
      >
        {isCarousel ? (
          <Carousel items={carouselItems!} />
        ) : isVideo ? (
          <FeedVideo
            refUri={media.cid}
            poster={posterRef}
            cropped={cropped}
            clipStart={media.start}
            clipEnd={media.end}
            liked={liked}
            onLike={() => like.mutate()}
          />
        ) : isGatedRef(media.cid) ? (
          <GatedMedia
            authorPubkey={post.author_pubkey}
            cid={media.cid}
            alt={media.alt || media.cap || "photo"}
            className="h-full w-full object-cover"
          />
        ) : (
          <MediaImage
            refUri={media.cid}
            alt={media.alt || media.cap || "photo"}
            className="h-full w-full object-cover"
          />
        )}
        {isReel && (
          <span className="pointer-events-none absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur">
            <Film className="h-3 w-3" /> Reel
          </span>
        )}
        {burst && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Heart className="h-24 w-24 animate-pop fill-white text-white drop-shadow-lg" />
          </div>
        )}
      </div>

      {/* Ad call-to-action bar (Instagram-style "Learn more" / "Shop now" …) */}
      {cta && (
        <a
          href={cta.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => recordClick(post.id, publicKey || undefined)}
          className="mx-3 mt-2 flex items-center justify-center gap-1 rounded-lg bg-ink-soft py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:mx-0"
        >
          {t(`cta.${cta.action}`)}
          <ChevronRight className="h-4 w-4" />
        </a>
      )}

      {/* actions */}
      <div className="flex items-center gap-4 px-3 pt-3 sm:px-0">
        <button
          onClick={triggerLike}
          className={cn(
            "flex items-center gap-1.5 transition-transform active:scale-90",
            liked ? "text-rouge-500" : "text-white hover:text-ink-muted",
          )}
          aria-label="Like"
        >
          <Heart className={cn("h-6 w-6", liked && "fill-rouge-500")} />
        </button>
        {!noComments && (
          <button
            onClick={() => navigate(`/p/${post.id}`)}
            className="text-white hover:text-ink-muted"
            aria-label="Comments"
          >
            <MessageCircle className="h-6 w-6" />
          </button>
        )}
        <RepostButton post={post} />
        <TipButton toAddress={profile?.address} toName={profile?.name} postId={post.id} />
        <ShareButton postId={post.id} />
        <SaveButton postId={post.id} className="ml-auto" />
      </div>

      {/* meta */}
      <div className="space-y-1 px-3 pt-2 sm:px-0">
        <TipsRow postId={post.id} />
        {!hideLikes && <LikedByRow postId={post.id} />}
        {(((stats?.likes ?? 0) > 0 && !hideLikes) || (stats?.reposts ?? 0) > 0) && (
          <div className="flex items-center gap-3 text-sm">
            {(stats?.likes ?? 0) > 0 && !hideLikes && (
              <span className="font-semibold">
                {formatCount(stats!.likes)} {stats!.likes === 1 ? "like" : "likes"}
              </span>
            )}
            {(stats?.reposts ?? 0) > 0 && (
              <span className="text-ink-muted">
                {formatCount(stats!.reposts)} {stats!.reposts === 1 ? "repost" : "reposts"}
              </span>
            )}
          </div>
        )}
        {media.cap && (
          <Caption
            authorPubkey={post.author_pubkey}
            text={media.cap}
          />
        )}
        {noComments ? (
          <div className="text-sm text-ink-muted">Comments are turned off.</div>
        ) : (
          (stats?.replies ?? 0) > 0 && (
            <button
              onClick={() => navigate(`/p/${post.id}`)}
              className="text-sm text-ink-muted hover:underline"
            >
              View {stats!.replies === 1 ? "1 comment" : `all ${formatCount(stats!.replies)} comments`}
            </button>
          )
        )}
        <div className="pt-0.5 text-[11px] uppercase tracking-wide text-ink-muted">
          {timeAgo(post.created_at)}
        </div>
      </div>
    </article>
  );
}

/**
 * A plain-text post (X/Threads-style) rendered as a first-class feed card:
 * full action row (like / comment / repost / tip / share / save) and a body that
 * links through to the thread view. `isThreadSegment` renders the compact form
 * used inside PostDetail's connected-thread rail (no bottom border, tighter).
 */
function TextPostCard({
  post,
  profile,
  isThreadSegment = false,
  embedded = false,
}: {
  post: SocialPost;
  profile?: { address: string; name: string; avatarRef: string };
  isThreadSegment?: boolean;
  /** Rendered inside another card (a repost) — drop the feed separator border. */
  embedded?: boolean;
}) {
  const navigate = useNavigate();
  const { data: stats } = usePostStats(post.id);
  const like = useToggleLike(post.id);
  const [expanded, setExpanded] = useState(false);
  const liked = stats?.liked ?? false;

  const CLAMP = 280;
  const isLong = post.body.length > CLAMP && !isThreadSegment;
  const shown = expanded || !isLong ? post.body : post.body.slice(0, CLAMP).trimEnd();

  return (
    <article
      className={cn(
        "animate-fade-in px-3 py-4 sm:px-0",
        !isThreadSegment && !embedded && "border-b border-ink-border/60",
      )}
    >
      <header className="flex items-center gap-3">
        <button onClick={() => navigate(profileTarget(profile?.address))}>
          <Avatar
            refUri={profile?.avatarRef}
            seed={post.author_pubkey}
            name={profile?.name}
            size={38}
          />
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <span className="flex items-center gap-1.5 truncate">
            <VerifiedName
              pubkey={post.author_pubkey}
              className="truncate text-sm font-semibold"
            />
            <Handle pubkey={post.author_pubkey} className="shrink-0 text-xs" />
          </span>
          <div className="truncate text-xs text-ink-muted">
            <span className="font-mono">{shortAddress(profile?.address ?? "", 10, 5)}</span> ·{" "}
            {timeAgo(post.created_at)}
          </div>
        </div>
        <FollowPill pubkey={post.author_pubkey} />
        <PostMenu post={post} />
      </header>

      <div
        className="mt-2 cursor-pointer"
        onClick={() => navigate(`/p/${post.id}`)}
      >
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed">
          <RichText text={shown} />
          {isLong && !expanded && (
            <>
              …{" "}
              <button
                className="text-ink-muted hover:underline"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(true);
                }}
              >
                more
              </button>
            </>
          )}
        </p>
      </div>
      <TranslateText text={post.body} className="mt-1" />

      {/* actions */}
      <div className="flex items-center gap-4 pt-3">
        <button
          onClick={() => like.mutate()}
          className={cn(
            "flex items-center gap-1.5 transition-transform active:scale-90",
            liked ? "text-rouge-500" : "text-white hover:text-ink-muted",
          )}
          aria-label="Like"
        >
          <Heart className={cn("h-6 w-6", liked && "fill-rouge-500")} />
        </button>
        <button
          onClick={() => navigate(`/p/${post.id}`)}
          className="text-white hover:text-ink-muted"
          aria-label="Comments"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
        <RepostButton post={post} />
        <TipButton toAddress={profile?.address} toName={profile?.name} postId={post.id} />
        <ShareButton postId={post.id} />
        <SaveButton postId={post.id} className="ml-auto" />
      </div>

      {/* meta */}
      <div className="space-y-1 pt-2">
        <TipsRow postId={post.id} />
        {(((stats?.likes ?? 0) > 0) || (stats?.reposts ?? 0) > 0) && (
          <div className="flex items-center gap-3 text-sm">
            {(stats?.likes ?? 0) > 0 && (
              <span className="font-semibold">
                {formatCount(stats!.likes)} {stats!.likes === 1 ? "like" : "likes"}
              </span>
            )}
            {(stats?.reposts ?? 0) > 0 && (
              <span className="text-ink-muted">
                {formatCount(stats!.reposts)} {stats!.reposts === 1 ? "repost" : "reposts"}
              </span>
            )}
          </div>
        )}
        {(stats?.replies ?? 0) > 0 && (
          <button
            onClick={() => navigate(`/p/${post.id}`)}
            className="text-sm text-ink-muted hover:underline"
          >
            View {stats!.replies === 1 ? "1 reply" : `all ${formatCount(stats!.replies)} replies`}
          </button>
        )}
      </div>
    </article>
  );
}

export { TextPostCard };

/**
 * A repost (client-side rebroadcast): a "{name} reposted" line above the
 * original post, embedded in full. With a quote (`cap`) the comment shows first
 * and the original is boxed beneath it. The original is fetched by id; a repost
 * of a repost isn't nested (just links through) to avoid runaway recursion.
 */
function RepostCard({ post, data }: { post: SocialPost; data: RepostEnvelope }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: reposter } = useProfile(post.author_pubkey);
  const orig = usePost(data.ref);
  const origPost = orig.data?.post;
  const origIsRepost = origPost ? decodeBody(origPost.body).kind === "repost" : false;
  const name = reposter?.name || shortAddress(reposter?.address ?? post.author_pubkey, 6, 4);

  return (
    <article className="animate-fade-in border-b border-ink-border/60 pb-1 pt-3">
      <button
        onClick={() => navigate(profileTarget(reposter?.address))}
        className="flex items-center gap-1.5 px-3 text-xs font-medium text-ink-muted hover:text-white sm:px-0"
      >
        <Repeat2 className="h-3.5 w-3.5 text-emerald-500" />
        {t("repost.repostedBy", { name })}
      </button>

      {data.cap && (
        <div className="whitespace-pre-wrap break-words px-3 pt-2 text-[15px] leading-relaxed sm:px-0">
          <RichText text={data.cap} />
        </div>
      )}

      <div className={cn(data.cap && "mt-2 overflow-hidden rounded-2xl border border-ink-border/70")}>
        {orig.isLoading ? (
          <div className="skeleton m-3 h-72 rounded-xl" />
        ) : origPost && !origIsRepost ? (
          <PostCard post={origPost} embedded />
        ) : (
          <button
            onClick={() => origPost && navigate(`/p/${origPost.id}`)}
            className="block w-full px-3 py-8 text-center text-sm text-ink-muted"
          >
            {origIsRepost ? t("repost.repost") : t("repost.unavailable")}
          </button>
        )}
      </div>
    </article>
  );
}

/**
 * Tip total + who tipped, shown under a post. Renders nothing until at least one
 * verified tip exists. Tapping it opens the full tipper list. Tips come from the
 * off-chain tips-ledger Worker (amounts are chain-verified there).
 */
function TipsRow({ postId }: { postId: string }) {
  const { data } = usePostTips(postId);
  const [open, setOpen] = useState(false);
  if (!data || data.total <= 0) return null;

  const preview = data.tippers.slice(0, 3);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-amber-300 transition-opacity hover:opacity-80"
      >
        <Coins className="h-4 w-4" />
        <span className="font-semibold">{formatCount(data.total)} XRGE</span>
        {preview.length > 0 && (
          <span className="flex -space-x-2">
            {preview.map((t) => (
              <span key={t.from} className="rounded-full ring-2 ring-ink">
                <Avatar seed={t.from} size={18} />
              </span>
            ))}
          </span>
        )}
        <span className="text-ink-muted">
          from {data.count} {data.count === 1 ? "tip" : "tips"}
        </span>
      </button>
      {open && (
        <TippersModal total={data.total} tippers={data.tippers} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function TippersModal({
  total,
  tippers,
  onClose,
}: {
  total: number;
  tippers: Tipper[];
  onClose: () => void;
}) {
  return (
    <Modal onClose={onClose} title="Tips">
      <div className="mb-3 flex items-center gap-2 text-amber-300">
        <Coins className="h-5 w-5" />
        <span className="text-lg font-semibold">{formatCount(total)} XRGE</span>
        <span className="text-sm text-ink-muted">
          · {tippers.length} {tippers.length === 1 ? "tip" : "tips"}
        </span>
      </div>
      <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
        {tippers.map((t) => (
          <TipperItem key={t.from + t.at} tipper={t} />
        ))}
      </ul>
    </Modal>
  );
}

function TipperItem({ tipper }: { tipper: Tipper }) {
  const navigate = useNavigate();
  const { data: profile } = useProfile(tipper.from);
  return (
    <li>
      <button
        onClick={() => profile?.address && navigate(`/u/${profile.address}`)}
        className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
      >
        <Avatar refUri={profile?.avatarRef} seed={tipper.from} name={profile?.name} size={36} />
        <div className="min-w-0 flex-1 leading-tight">
          <VerifiedName pubkey={tipper.from} className="truncate text-sm font-semibold" />
          <div className="truncate text-xs text-ink-muted">
            <span className="font-mono">{shortAddress(profile?.address ?? "", 8, 4)}</span> ·{" "}
            {timeAgo(tipper.at)}
          </div>
        </div>
        <span className="shrink-0 text-sm font-semibold text-amber-300">
          {formatCount(tipper.amount)} XRGE
        </span>
      </button>
    </li>
  );
}

function ShareButton({ postId }: { postId: string }) {
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  const { data: count } = useShareCount(postId);
  const record = useRecordShare(postId);
  function share() {
    const url = `${location.origin}/p/${postId}`;
    if (navigator.share) {
      navigator.share({ url, title: "RouGee" }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      toast("Link copied", "success");
    }
    record.mutate(); // tally the share (best-effort)
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <button
      onClick={share}
      className="flex items-center gap-1.5 text-white hover:text-ink-muted"
      aria-label="Share"
    >
      {done ? <Check className="h-6 w-6 text-emerald-400" /> : <Share2 className="h-6 w-6" />}
      {(count ?? 0) > 0 && <span className="text-sm">{formatCount(count!)}</span>}
    </button>
  );
}

/**
 * Instagram-style "Follow" pill in a post header. Shown only for other people's
 * posts you don't already follow; disappears once you follow (IG behavior). The
 * hooks live here (not in PostCard) so they don't run for your own posts.
 */
function FollowPill({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation();
  const { publicKey, wallet } = useAuth();
  const { data: stats } = useArtistStats(pubkey);
  const toggle = useToggleFollow(pubkey);
  if (!publicKey || publicKey === pubkey || stats?.isFollowing) return null;
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (wallet) toggle.mutate();
      }}
      disabled={toggle.isPending || !wallet}
      className={cn(
        "shrink-0 rounded-md bg-rouge-500 px-3 py-1 text-xs font-semibold text-white",
        "transition hover:opacity-90 disabled:opacity-50",
      )}
    >
      {toggle.isPending ? "…" : t("common.follow")}
    </button>
  );
}

/** One avatar in the "Liked by" facepile — resolves the liker's avatar. */
function LikerAvatar({ pubkey }: { pubkey: string }) {
  const { data: p } = useProfile(pubkey);
  return (
    <Avatar refUri={p?.avatarRef} seed={pubkey} name={p?.name} size={18} className="ring-2 ring-ink" />
  );
}

/**
 * Instagram-style "Liked by {name} and N others" social-proof row with an avatar
 * facepile. Dormant until the node exposes a who-liked route (usePostLikers is
 * gated by LIKERS_ENABLED) — renders nothing, never fabricated. See
 * lib/features.ts for the exact backend spec to light it up.
 */
function LikedByRow({ postId }: { postId: string }) {
  const { data } = usePostLikers(postId);
  const likers = data?.likers ?? [];
  const first = likers[0];
  const firstProfile = useProfile(first); // unconditional; disabled when first is undefined
  if (!first) return null;
  const others = Math.max(0, (data?.total ?? likers.length) - 1);
  const addr = firstProfile.data?.address;
  const name = (
    <VerifiedName pubkey={first} className="font-semibold text-white" />
  );
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="flex -space-x-2">
        {likers.slice(0, 3).map((pk) => (
          <LikerAvatar key={pk} pubkey={pk} />
        ))}
      </div>
      <span className="text-ink-muted">
        Liked by{" "}
        {addr ? (
          <Link
            to={`/u/${addr}`}
            onClick={(e) => e.stopPropagation()}
            className="hover:underline"
          >
            {name}
          </Link>
        ) : (
          name
        )}
        {others > 0 && <> and {formatCount(others)} others</>}
      </span>
    </div>
  );
}

function PostMenu({ post }: { post: SocialPost }) {
  const { t } = useTranslation();
  const { publicKey, wallet } = useAuth();
  const { toast } = useToast();
  const del = useDeletePost();
  const addToStory = useAddToStory();
  const pinPost = usePinPost();
  const [open, setOpen] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const isMine = publicKey === post.author_pubkey;
  // "Add to your story" needs a wallet and a re-shareable post type.
  const canStory = !!wallet && canShareToStory(post);
  // Only media posts can be pinned (the profile grid is media-only).
  const canPin = isMine && isMediaBody(post.body);
  const pinned = pinPost.isPinned(post.id);

  const togglePin = async () => {
    setOpen(false);
    try {
      await (pinned ? pinPost.unpin(post.id) : pinPost.pin(post.id));
      toast(pinned ? "Unpinned from profile" : "Pinned to profile", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update pins", "error");
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(`${location.origin}/p/${post.id}`);
    toast("Link copied", "success");
    setOpen(false);
  };

  const share = async () => {
    setOpen(false);
    setSharing(true);
    try {
      await addToStory(post);
      toast("Added to your story", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't add to your story", "error");
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="relative">
      <button
        className="text-ink-muted hover:text-white disabled:opacity-50"
        onClick={() => setOpen((o) => !o)}
        disabled={sharing}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="glass absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl">
            {canStory && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5"
                onClick={share}
              >
                <Plus className="h-4 w-4 text-rouge-400" /> Add to your story
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5"
              onClick={copyLink}
            >
              <Share2 className="h-4 w-4" /> Copy link
            </button>
            {canPin && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5 disabled:opacity-50"
                disabled={pinPost.busy}
                onClick={togglePin}
              >
                {pinned ? (
                  <>
                    <PinOff className="h-4 w-4" /> Unpin from profile
                  </>
                ) : (
                  <>
                    <Pin className="h-4 w-4 text-rouge-400" /> Pin to profile
                  </>
                )}
              </button>
            )}
            {isMine && promoteEnabled() && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5"
                onClick={() => {
                  setBoosting(true);
                  setOpen(false);
                }}
              >
                <Rocket className="h-4 w-4 text-rouge-400" /> {t("ads.boostPost")}
              </button>
            )}
            {isMine && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-rouge-400 hover:bg-white/5 disabled:opacity-50"
                disabled={del.isPending}
                onClick={() => {
                  del.mutate(post.id, {
                    onSuccess: () => toast("Post deleted", "success"),
                    onError: (e) =>
                      toast(e instanceof Error ? e.message : "Delete failed", "error"),
                  });
                  setOpen(false);
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete post
              </button>
            )}
          </div>
        </>
      )}
      {boosting && <BoostModal postId={post.id} onClose={() => setBoosting(false)} />}
    </div>
  );
}

function profileTarget(address?: string): string {
  return address ? `/u/${address}` : "#";
}
