import { useEffect, useRef } from "react";
import { Rocket } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import PostCard from "./PostCard";
import { useAuth } from "@/store/auth";
import { useToast } from "./Toast";
import { recordImpression } from "@/lib/promote";

/**
 * A boosted post shown in a feed: labeled "Sponsored", and it fires a one-time
 * impression when it scrolls into view. If the viewer is eligible, they earn a
 * micro-reward from the ad's pool and see a "+X XRGE" toast.
 */
export default function SponsoredPost({ post }: { post: SocialPost }) {
  const { publicKey } = useAuth();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !publicKey) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !fired.current) {
          fired.current = true;
          obs.disconnect();
          recordImpression(post.id, publicKey).then((r) => {
            if (r.earned > 0) toast(`+${r.earned} XRGE for viewing 🎉`, "success");
          });
        }
      },
      { threshold: 0.6 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [post.id, publicKey, toast]);

  return (
    <div ref={ref}>
      <div className="flex items-center gap-1 px-3 pb-0.5 pt-3 text-[11px] font-semibold uppercase tracking-wide text-rouge-400 sm:px-0">
        <Rocket className="h-3 w-3" /> Sponsored
      </div>
      <PostCard post={post} />
    </div>
  );
}
