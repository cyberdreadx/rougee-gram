import { useState } from "react";
import { Globe, ExternalLink } from "lucide-react";
import type { FeedPost } from "@/lib/nostrFeed";
import { timeAgo } from "@/lib/format";
import Avatar from "./Avatar";
import RichText from "./RichText";

/**
 * A Nostr note mixed into the Discover feed. Read-only and clearly marked:
 * identity/avatar come from the note's kind-0 profile, media renders natively
 * (https), and actions link out to Nostr — likes/tips stay on RougeChain.
 */
export default function NostrPostCard({ post }: { post: FeedPost }) {
  const n = post.nostr;
  if (!n) return null;
  const [broken, setBroken] = useState(false);
  const images = n.images.slice(0, 4);

  return (
    <article className="border-b border-ink-border px-4 py-3">
      {/* header */}
      <div className="flex items-center gap-3">
        {n.avatar && !broken ? (
          <img
            src={n.avatar}
            alt=""
            loading="lazy"
            onError={() => setBroken(true)}
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
            <a
              key={url}
              href={n.noteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
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

      {/* footer — actions live on Nostr, not RougeChain */}
      <div className="mt-3">
        <a
          href={n.noteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink"
        >
          <ExternalLink className="h-3.5 w-3.5" /> View on Nostr
        </a>
      </div>
    </article>
  );
}
