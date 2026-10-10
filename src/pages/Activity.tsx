import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Heart, Users, Grid3x3, MessageCircle, Repeat2, Globe, AtSign, Coins } from "lucide-react";
import {
  useActivity,
  type ActivityComment,
  type ActivityTip,
} from "@/hooks/useSocial";
import { useProfile } from "@/hooks/useProfile";
import { useNostrNotifications } from "@/hooks/useNostrFeed";
import { useMentions } from "@/hooks/useMentions";
import { markNotificationsRead, type NostrNotification } from "@/lib/nostrNotifications";
import { type Mention } from "@/lib/mentions";
import { shortNpub } from "@/lib/nostrAuth";
import { decodeBody } from "@/lib/envelope";
import { timeAgo, formatCount } from "@/lib/format";
import Avatar from "@/components/Avatar";
import MediaImage from "@/components/MediaImage";
import UserLink from "@/components/UserLink";

export default function Activity() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useActivity();
  const { items: notifs } = useNostrNotifications();
  const { items: mentions, markRead: markMentionsRead } = useMentions();

  // Opening Activity clears the unread badges.
  useEffect(() => {
    markNotificationsRead();
  }, [notifs.length]);
  useEffect(() => {
    markMentionsRead();
  }, [mentions.length, markMentionsRead]);

  return (
    <div>
      <header className="sticky top-[var(--top-bar-h)] z-20 border-b border-ink-border bg-ink/55 px-4 py-3.5 backdrop-blur md:top-0">
        <h1 className="text-base font-semibold">{t("activity.title")}</h1>
        <p className="text-xs text-ink-muted">{t("activity.subtitle")}</p>
      </header>

      {notifs.length > 0 && (
        <>
          <h2 className="flex items-center gap-1.5 px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <Globe className="h-3.5 w-3.5" /> Nostr
          </h2>
          <div className="divide-y divide-ink-border/60">
            {notifs.map((n) => (
              <NostrNotifRow key={n.id} item={n} />
            ))}
          </div>
        </>
      )}

      {mentions.length > 0 && (
        <>
          <h2 className="flex items-center gap-1.5 px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <AtSign className="h-3.5 w-3.5" /> Mentions
          </h2>
          <div className="divide-y divide-ink-border/60">
            {mentions.map((m) => (
              <MentionRow key={m.postId} item={m} />
            ))}
          </div>
        </>
      )}

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        </div>
      )}

      {isError && (
        <div className="py-16 text-center text-sm text-ink-muted">
          {t("activity.loadError")}
        </div>
      )}

      {data && (
        <>
          {/* Aggregates */}
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
            <Stat icon={<Coins className="h-4 w-4" />} label={t("activity.statTipped")} value={data.totalTips} />
            <Stat icon={<Heart className="h-4 w-4" />} label={t("activity.statLikes")} value={data.totalLikes} />
            <Stat icon={<Users className="h-4 w-4" />} label={t("activity.statFollowers")} value={data.followers} />
            <Stat icon={<Grid3x3 className="h-4 w-4" />} label={t("activity.statPosts")} value={data.postCount} />
          </div>
          <p className="px-4 pb-2 text-xs text-ink-muted">
            {t("activity.likesNote")}
          </p>

          {/* New followers */}
          {data.newFollowers.length > 0 && (
            <>
              <h2 className="px-4 pt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                {t("activity.newFollowers")}
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
                {t("activity.recentTips")}
              </h2>
              <div className="divide-y divide-ink-border/60">
                {data.tips.map((tip) => (
                  <TipRow key={tip.from + tip.at} item={tip} />
                ))}
              </div>
            </>
          )}

          {/* Comments */}
          <h2 className="px-4 pt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("activity.recentComments")}
          </h2>
          {data.comments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center text-sm text-ink-muted">
              <MessageCircle className="h-8 w-8" />
              {t("activity.noComments")}
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

function NostrNotifRow({ item }: { item: NostrNotification }) {
  const name = item.profile?.name?.trim() || shortNpub(item.fromPubkey);
  const verb =
    item.type === "like"
      ? "liked your post"
      : item.type === "repost"
        ? "reposted your post"
        : "replied";
  const Icon = item.type === "like" ? Heart : item.type === "repost" ? Repeat2 : MessageCircle;
  const tone =
    item.type === "like" ? "text-rose-400" : item.type === "repost" ? "text-emerald-400" : "text-sky-400";
  return (
    <Link
      to={`/nostr/${item.fromPubkey}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
    >
      <div className="relative shrink-0">
        {item.profile?.picture ? (
          <img src={item.profile.picture} alt="" loading="lazy" className="h-9 w-9 rounded-full object-cover" />
        ) : (
          <Avatar seed={item.fromPubkey} name={name} size={38} />
        )}
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-ink p-0.5">
          <Icon className={`h-3.5 w-3.5 ${tone}`} />
        </span>
      </div>
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-sm">
          <span className="font-semibold">{name}</span>{" "}
          <span className="text-ink-muted">{verb}</span>
          {item.content ? <span className="text-ink-muted"> {item.content}</span> : null}
        </p>
        <span className="text-xs text-ink-muted">{timeAgo(item.created_at)}</span>
      </div>
    </Link>
  );
}

function MentionRow({ item }: { item: Mention }) {
  const { data: profile } = useProfile(item.from);
  return (
    <Link
      to={`/p/${item.postId}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
    >
      <div className="relative shrink-0">
        <Avatar refUri={profile?.avatarRef} seed={item.from} name={profile?.name} size={38} />
        <span className="absolute -bottom-0.5 -right-0.5 rounded-full bg-ink p-0.5">
          <AtSign className="h-3.5 w-3.5 text-rouge-400" />
        </span>
      </div>
      <div className="min-w-0 flex-1 leading-snug">
        <p className="truncate text-sm">
          <UserLink pubkey={item.from} className="font-semibold" />{" "}
          <span className="text-ink-muted">mentioned you in a post</span>
        </p>
        <span className="text-xs text-ink-muted">{timeAgo(item.at)}</span>
      </div>
    </Link>
  );
}

function FollowerRow({ pubkey }: { pubkey: string }) {
  const { t } = useTranslation();
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
          <span className="text-ink-muted">{t("activity.startedFollowing")}</span>
        </p>
      </div>
    </Link>
  );
}

function TipRow({ item }: { item: ActivityTip }) {
  const { t } = useTranslation();
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
          <span className="text-ink-muted">{t("activity.tippedVerb")}</span>{" "}
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
  const { t } = useTranslation();
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
          <span className="text-ink-muted">{t("activity.commented")}</span> {item.comment.body}
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
