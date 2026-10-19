import { useQuery } from "@tanstack/react-query";
import { Loader2, Lock } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { rc } from "@/lib/rouge";
import { decodeBody } from "@/lib/envelope";
import { isGatedRef } from "@/lib/subs";
import { useProfile } from "@/hooks/useProfile";
import { shortAddress } from "@/lib/format";
import MediaImage from "./MediaImage";
import Avatar from "./Avatar";

/**
 * A tiny read-only taste of the feed for signed-out newcomers — the first few
 * real media posts, no interactions. Everything else is behind "create an
 * account". Reads are public, so no wallet is needed to show it.
 */
export default function TeaserPeek({ limit = 3 }: { limit?: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["teaser-peek", limit],
    staleTime: 60_000,
    queryFn: async (): Promise<SocialPost[]> => {
      const posts = await rc().social.getGlobalTimeline(24, 0);
      return (posts ?? [])
        .filter((p) => {
          if (p.reply_to_id) return false;
          const d = decodeBody(p.body);
          if (d.kind !== "photo" && d.kind !== "carousel") return false;
          // Only public images make a good glimpse (skip gated/ad).
          const cid = d.kind === "photo" ? d.data.cid : d.data.items[0]?.cid;
          return !!cid && !isGatedRef(cid) && !(d.data as { ad?: boolean }).ad;
        })
        .slice(0, limit) as SocialPost[];
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
