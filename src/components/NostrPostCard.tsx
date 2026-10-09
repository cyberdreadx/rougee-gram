import { useState } from "react";
import { Globe, ExternalLink, Heart, Repeat2 } from "lucide-react";
import type { FeedPost } from "@/lib/nostrFeed";
import { timeAgo } from "@/lib/format";
import { useAuth } from "@/store/auth";
import { useActed } from "@/hooks/useNostrFeed";
import {
  buildReaction,
  buildRepost,
  publishEvent,
  markActed,
  eventIdOf,
} from "@/lib/nostrAuth";
import { cn } from "@/lib/utils";
import Avatar from "./Avatar";
import RichText from "./RichText";

/**
 * A Nostr note mixed into the Discover feed. Identity/avatar come from the
 * note's kind-0 profile, media renders natively (https). Like/repost are
 * published to Nostr with the viewer's own Nostr key (GLTCH-style); value
 * (tips) stays on RougeChain.
 */
export default function NostrPostCard({ post }: { post: FeedPost }) {
  const { address } = useAuth();
  const acted = useActed()[post.id];
  const [brokenAvatar, setBrokenAvatar] = useState(false);
  const [busy, setBusy] = useState<null | "like" | "repost">(null);

  const n = post.nostr;
  const owner = address || "anon";

  const like = async () => {
    if (!n || acted?.liked || busy) return;
    setBusy("like");
    try {
      await publishEvent(owner, buildReaction({ id: eventIdOf(post.id), pubkey: n.pubkey }));
      markActed(post.id, "liked");
    } catch {
      /* relay rejected */
    } finally {
      setBusy(null);
    }
  };

  const repost = async () => {
    if (!n || acted?.reposted || busy) return;
    setBusy("repost");
    try {
      await publishEvent(owner, buildRepost({ id: eventIdOf(post.id), pubkey: n.pubkey }));
      markActed(post.id, "reposted");
    } catch {
      /* relay rejected */
    } finally {
      setBusy(null);
    }
  };

  if (!n) return null;
  const images = n.images.slice(0, 4);

  return (
    <article className="border-b border-ink-border px-4 py-3">
      {/* header */}
      <div className="flex items-center gap-3">
        {n.avatar && !brokenAvatar ? (
          <img
            src={n.avatar}
            alt=""
            loading="lazy"
            onError={() => setBrokenAvatar(true)}
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <Avatar seed={n.pubkey} name={n.name} size={40} />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold">{n.name}</span>
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

      {/* media */}
      {images.length > 0 && (
        <div
          className={
            "mt-3 overflow-hidden rounded-xl " +
            (images.length === 1 ? "" : "grid grid-cols-2 gap-0.5")
          }
        >
          {images.map((url) => (
            <a key={url} href={n.noteUrl} target="_blank" rel="noopener noreferrer" className="block">
              <img
                src={url}
                alt=""
                loading="lazy"
                className={
                  "w-full object-cover " +
                  (images.length === 1 ? "max-h-[70vh]" : "aspect-square")
                }
              />
            </a>
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
    </article>
  );
}
