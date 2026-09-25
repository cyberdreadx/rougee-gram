import { Link } from "react-router-dom";
import { Loader2, Heart, Users, Grid3x3, MessageCircle, Coins } from "lucide-react";
import {
  useActivity,
  type ActivityComment,
  type ActivityTip,
} from "@/hooks/useSocial";
import { useProfile } from "@/hooks/useProfile";
import { decodeBody } from "@/lib/envelope";
import { timeAgo, formatCount } from "@/lib/format";
import Avatar from "@/components/Avatar";
import MediaImage from "@/components/MediaImage";
import UserLink from "@/components/UserLink";

export default function Activity() {
  const { data, isLoading, isError } = useActivity();

  return (
    <div>
      <header className="sticky top-[var(--top-bar-h)] z-20 border-b border-ink-border bg-ink/80 px-4 py-3.5 backdrop-blur md:top-0">
        <h1 className="text-base font-semibold">Activity</h1>
        <p className="text-xs text-ink-muted">Comments on your posts &amp; your reach</p>
      </header>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        </div>
      )}

      {isError && (
        <div className="py-16 text-center text-sm text-ink-muted">
          Couldn't load your activity.
        </div>
      )}

      {data && (
        <>
          {/* Aggregates */}
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
            <Stat icon={<Coins className="h-4 w-4" />} label="XRGE tipped" value={data.totalTips} />
            <Stat icon={<Heart className="h-4 w-4" />} label="Likes" value={data.totalLikes} />
            <Stat icon={<Users className="h-4 w-4" />} label="Followers" value={data.followers} />
            <Stat icon={<Grid3x3 className="h-4 w-4" />} label="Posts" value={data.postCount} />
          </div>
          <p className="px-4 pb-2 text-xs text-ink-muted">
            Likes are shown as a total — RougeChain exposes counts, not
            identities, for likes.
          </p>

          {/* New followers */}
          {data.newFollowers.length > 0 && (
            <>
              <h2 className="px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                New followers
              </h2>
              <div className="divide-y divide-ink-border/60">
                {data.newFollowers.map((pk) => (
                  <FollowerRow key={pk} pubkey={pk} />
                ))}
              </div>
            </>
          )}

          {/* Tips */}
          {data.tips.length > 0 && (
            <>
              <h2 className="px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Recent tips
              </h2>
              <div className="divide-y divide-ink-border/60">
                {data.tips.map((t) => (
                  <TipRow key={t.from + t.at} item={t} />
                ))}
              </div>
            </>
          )}

          {/* Comments */}
          <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Recent comments
          </h2>
          {data.comments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-ink-muted">
              <MessageCircle className="h-8 w-8" />
              No comments on your posts yet.
            </div>
          ) : (
            <div className="divide-y divide-ink-border/60">
              {data.comments.map((c) => (
                <CommentRow key={c.comment.id} item={c} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="card flex flex-col items-center gap-1 py-3">
      <span className="text-rouge-400">{icon}</span>
      <span className="text-lg font-bold">{formatCount(value)}</span>
      <span className="text-xs text-ink-muted">{label}</span>
    </div>
  );
}

/** Thumbnail cid for a post, if it has visual media. */
function postThumb(post: { body: string }): string | undefined {
  const decoded = decodeBody(post.body);
  return decoded.kind === "photo"
    ? decoded.data.cid
    : decoded.kind === "video"
      ? decoded.data.poster
      : decoded.kind === "carousel"
        ? decoded.data.items[0]?.cid
        : undefined;
}

function FollowerRow({ pubkey }: { pubkey: string }) {
  const { data: profile } = useProfile(pubkey);
  return (
    <Link
      to={profile?.address ? `/u/${profile.address}` : "#"}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
    >
      <Avatar refUri={profile?.avatarRef} seed={pubkey} name={profile?.name} size={38} />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-sm">
          <UserLink pubkey={pubkey} className="font-semibold" />{" "}
          <span className="text-ink-muted">started following you</span>
        </p>
      </div>
    </Link>
  );
}

function TipRow({ item }: { item: ActivityTip }) {
  const { data: profile } = useProfile(item.from);
  const thumb = postThumb(item.post);
  return (
    <Link
      to={`/p/${item.post.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
    >
      <Avatar refUri={profile?.avatarRef} seed={item.from} name={profile?.name} size={38} />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-sm">
          <UserLink pubkey={item.from} className="font-semibold" />{" "}
          <span className="text-ink-muted">tipped</span>{" "}
          <span className="font-semibold text-amber-300">{formatCount(item.amount)} XRGE</span>
        </p>
        <span className="text-xs text-ink-muted">{timeAgo(item.at)}</span>
      </div>
      {thumb ? (
        <MediaImage refUri={thumb} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-11 w-11 shrink-0 rounded bg-ink-soft" />
      )}
    </Link>
  );
}

function CommentRow({ item }: { item: ActivityComment }) {
  const { data: profile } = useProfile(item.comment.author_pubkey);
  const thumb = postThumb(item.post);

  return (
    <Link
      to={`/p/${item.post.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
    >
      <Avatar
        refUri={profile?.avatarRef}
        seed={item.comment.author_pubkey}
        name={profile?.name}
        size={38}
      />
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-sm">
          <UserLink pubkey={item.comment.author_pubkey} className="font-semibold" />{" "}
          <span className="text-ink-muted">commented:</span> {item.comment.body}
        </p>
        <span className="text-xs text-ink-muted">{timeAgo(item.comment.created_at)}</span>
      </div>
      {thumb ? (
        <MediaImage refUri={thumb} alt="" className="h-11 w-11 shrink-0 rounded object-cover" />
      ) : (
        <div className="h-11 w-11 shrink-0 rounded bg-ink-soft" />
      )}
    </Link>
  );
}
