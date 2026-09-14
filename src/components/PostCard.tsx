import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Heart,
  MessageCircle,
  Share2,
  MoreHorizontal,
  Trash2,
  Check,
} from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { decodeBody } from "@/lib/envelope";
import { useProfile } from "@/hooks/useProfile";
import { usePostStats, useToggleLike, useDeletePost } from "@/hooks/useSocial";
import { useAuth } from "@/store/auth";
import { useToast } from "./Toast";
import { shortAddress, timeAgo, formatCount } from "@/lib/format";
import Avatar from "./Avatar";
import MediaImage from "./MediaImage";
import UserLink from "./UserLink";
import Caption from "./Caption";
import { cn } from "@/lib/utils";

export default function PostCard({ post }: { post: SocialPost }) {
  const decoded = decodeBody(post.body);
  const { data: profile } = useProfile(post.author_pubkey);
  const { data: stats } = usePostStats(post.id);
  const like = useToggleLike(post.id);
  const navigate = useNavigate();
  const [burst, setBurst] = useState(false);
  const lastTap = useRef(0);

  // Non-photo posts (plain text already on-chain) render as a simple text card.
  if (decoded.kind !== "photo") {
    if (decoded.kind === "profile") return null; // profile-metadata posts are hidden
    return <TextPostCard post={post} profile={profile} />;
  }

  const photo = decoded.data;
  const liked = stats?.liked ?? false;

  function triggerLike() {
    if (!liked) {
      setBurst(true);
      setTimeout(() => setBurst(false), 700);
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
    <article className="animate-fade-in border-b border-ink-border/60 py-3 sm:py-4">
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
          <UserLink
            pubkey={post.author_pubkey}
            className="text-sm font-semibold"
          />
          <div className="text-xs text-ink-muted">
            {shortAddress(profile?.address ?? "", 10, 5)} · {timeAgo(post.created_at)}
          </div>
        </div>
        <PostMenu postId={post.id} authorPubkey={post.author_pubkey} />
      </header>

      {/* image */}
      <div
        className="relative mt-3 select-none overflow-hidden bg-black sm:rounded-2xl"
        onClick={onImageTap}
        onDoubleClick={() => !liked && triggerLike()}
      >
        <MediaImage
          refUri={photo.cid}
          alt={photo.alt || photo.cap || "photo"}
          className="max-h-[75vh] w-full object-contain"
        />
        {burst && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <Heart className="h-24 w-24 animate-pop fill-white text-white drop-shadow-lg" />
          </div>
        )}
      </div>

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
        <button
          onClick={() => navigate(`/p/${post.id}`)}
          className="text-white hover:text-ink-muted"
          aria-label="Comments"
        >
          <MessageCircle className="h-6 w-6" />
        </button>
        <ShareButton postId={post.id} />
      </div>

      {/* meta */}
      <div className="space-y-1 px-3 pt-2 sm:px-0">
        {(stats?.likes ?? 0) > 0 && (
          <div className="text-sm font-semibold">
            {formatCount(stats!.likes)} {stats!.likes === 1 ? "like" : "likes"}
          </div>
        )}
        {photo.cap && (
          <Caption
            authorPubkey={post.author_pubkey}
            text={photo.cap}
          />
        )}
        {(stats?.replies ?? 0) > 0 && (
          <button
            onClick={() => navigate(`/p/${post.id}`)}
            className="text-sm text-ink-muted hover:underline"
          >
            View {stats!.replies === 1 ? "1 comment" : `all ${formatCount(stats!.replies)} comments`}
          </button>
        )}
        <div className="pt-0.5 text-[11px] uppercase tracking-wide text-ink-muted">
          {timeAgo(post.created_at)}
        </div>
      </div>
    </article>
  );
}

function TextPostCard({
  post,
  profile,
}: {
  post: SocialPost;
  profile?: { address: string; name: string; avatarRef: string };
}) {
  return (
    <article className="animate-fade-in border-b border-ink-border/60 px-3 py-4 sm:px-0">
      <header className="flex items-center gap-3">
        <Avatar
          refUri={profile?.avatarRef}
          seed={post.author_pubkey}
          name={profile?.name}
          size={38}
        />
        <div className="min-w-0 flex-1 leading-tight">
          <UserLink pubkey={post.author_pubkey} className="text-sm font-semibold" />
          <div className="text-xs text-ink-muted">{timeAgo(post.created_at)}</div>
        </div>
      </header>
      <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-relaxed">
        {post.body}
      </p>
    </article>
  );
}

function ShareButton({ postId }: { postId: string }) {
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  function share() {
    const url = `${location.origin}/p/${postId}`;
    if (navigator.share) {
      navigator.share({ url, title: "Rougee-gram" }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url);
      toast("Link copied", "success");
    }
    setDone(true);
    setTimeout(() => setDone(false), 1500);
  }
  return (
    <button
      onClick={share}
      className="ml-auto text-white hover:text-ink-muted"
      aria-label="Share"
    >
      {done ? <Check className="h-6 w-6 text-emerald-400" /> : <Share2 className="h-6 w-6" />}
    </button>
  );
}

function PostMenu({
  postId,
  authorPubkey,
}: {
  postId: string;
  authorPubkey: string;
}) {
  const { publicKey } = useAuth();
  const { toast } = useToast();
  const del = useDeletePost();
  const [open, setOpen] = useState(false);
  const isMine = publicKey === authorPubkey;

  if (!isMine) {
    return (
      <button
        className="text-ink-muted hover:text-white"
        onClick={() => {
          navigator.clipboard.writeText(`${location.origin}/p/${postId}`);
          toast("Link copied", "success");
        }}
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="relative">
      <button className="text-ink-muted hover:text-white" onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="h-5 w-5" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-ink-border bg-ink-card shadow-xl">
            <button
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-rouge-400 hover:bg-white/5 disabled:opacity-50"
              disabled={del.isPending}
              onClick={() => {
                del.mutate(postId, {
                  onSuccess: () => toast("Post deleted", "success"),
                  onError: (e) =>
                    toast(e instanceof Error ? e.message : "Delete failed", "error"),
                });
                setOpen(false);
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete post
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function profileTarget(address?: string): string {
  return address ? `/u/${address}` : "#";
}
