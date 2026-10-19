import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { rc } from "@/lib/rouge";
import { getConfig } from "@/lib/config";
import { decodeBody } from "@/lib/envelope";
import { isGatedRef } from "@/lib/subs";
import { useProfile } from "@/hooks/useProfile";
import { shortAddress } from "@/lib/format";
import MediaImage from "./MediaImage";
import Avatar from "./Avatar";

// A deliberately small guard for the fallback (uncurated) path only: the peek is
// the FIRST thing a signed-out newcomer sees, so skip captions with obvious
// NSFW/slur terms. This is a coarse net, not moderation — the curated allowlist
// is the real control; once past signup the normal global feed applies.
const UNSAFE = /\b(porn|xxx|nsfw|nude|nudes|onlyfans|fuck|shit|cunt|nigg|fag|rape|cum)\b/i;

/** A post is a good glimpse if it's a public (non-gated, non-ad) image. */
function pickCid(p: SocialPost, allowUnsafeCaption: boolean): string | null {
  if (p.reply_to_id) return null;
  const d = decodeBody(p.body);
  if (d.kind !== "photo" && d.kind !== "carousel") return null;
  const cid = d.kind === "photo" ? d.data.cid : d.data.items[0]?.cid;
  if (!cid || isGatedRef(cid) || (d.data as { ad?: boolean }).ad) return null;
  if (!allowUnsafeCaption && UNSAFE.test(d.data.cap || "")) return null;
  return cid;
}

/**
 * A tiny read-only taste of the feed for signed-out newcomers — a few real media
 * posts, no interactions. Everything else is behind "create an account".
 *
 * Curation: when `VITE_PEEK_ACCOUNTS` lists accounts, the peek shows ONLY their
 * recent media — a controlled first impression. With no allowlist it falls back
 * to the global timeline with a coarse NSFW caption filter so the very first
 * screen isn't a random slice of a global, unmoderated network. Reads are
 * public, so no wallet is needed either way.
 */
export default function TeaserPeek({ limit = 3 }: { limit?: number }) {
  const accounts = getConfig().peekAccounts;
  const curated = accounts.length > 0;

  const { data, isLoading } = useQuery({
    queryKey: ["teaser-peek", limit, curated ? accounts : "global"],
    staleTime: 60_000,
    queryFn: async (): Promise<SocialPost[]> => {
      if (curated) {
        // Curated: pull each allowlisted account's recent posts, keep media,
        // merge newest-first. Trusted accounts → skip the caption filter.
        const pages = await Promise.all(
          accounts.map((pk) =>
            rc()
              .social.getUserPosts(pk, 6, 0)
              .then((r: { posts?: SocialPost[] }) => r.posts ?? [])
              .catch(() => [] as SocialPost[]),
          ),
        );
        return pages
          .flat()
          .filter((p) => pickCid(p, true))
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, limit);
      }
      const posts = await rc().social.getGlobalTimeline(24, 0);
      return (posts ?? []).filter((p) => pickCid(p, false)).slice(0, limit);
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    );
  }
  if (!data || data.length === 0) return null;

  return (
    <div className="space-y-3">
      {data.map((p) => (
        <PeekCard key={p.id} post={p} />
      ))}
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-border py-6 text-sm text-ink-muted">
        <Lock className="h-4 w-4" /> Create an account to see everything
      </div>
    </div>
  );
}

function PeekCard({ post }: { post: SocialPost }) {
  const d = decodeBody(post.body);
  const { data: profile } = useProfile(post.author_pubkey);
  const cid = d.kind === "photo" ? d.data.cid : d.kind === "carousel" ? d.data.items[0]?.cid : "";
  const cap = d.kind === "photo" || d.kind === "carousel" ? d.data.cap : "";
  if (!cid) return null;
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-border bg-ink-soft">
      <div className="flex items-center gap-2 p-3">
        <Avatar refUri={profile?.avatarRef} seed={post.author_pubkey} name={profile?.name} size={32} />
        <span className="truncate text-sm font-semibold">
          {profile?.name || shortAddress(profile?.address ?? post.author_pubkey, 8, 4)}
        </span>
      </div>
      <MediaImage refUri={cid} alt="" className="aspect-square w-full object-cover" />
      {cap && <p className="line-clamp-2 px-3 py-2 text-sm text-ink-muted">{cap}</p>}
    </div>
  );
}
