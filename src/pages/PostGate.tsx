import { useState } from "react";
import { Lock, Heart, MessageCircle, Coins, Loader2 } from "lucide-react";
import { useAuth } from "@/store/auth";
import { usePost, usePostStats, usePostTips } from "@/hooks/useSocial";
import { useProfile } from "@/hooks/useProfile";
import { decodeBody } from "@/lib/envelope";
import { formatCount, timeAgo, shortAddress } from "@/lib/format";
import Avatar from "@/components/Avatar";
import MediaImage from "@/components/MediaImage";
import Logo from "@/components/Logo";
import Onboarding from "./Onboarding";
import Unlock from "./Unlock";

/**
 * Public teaser for a shared post when the visitor has no account yet. Shows the
 * author, caption and engagement (likes / comments / tips) as social proof, but
 * keeps the photo BLURRED behind a "create an account" gate. Finishing signup
 * flips auth status; the URL stayed /p/:id throughout, so the app then renders
 * the real post. This mirrors the blurred share-card the link unfurls with.
 */
function firstImageRef(body: string): string | undefined {
  const d = decodeBody(body);
  if (d.kind === "photo") return d.data.cid;
  if (d.kind === "carousel") return d.data.items[0]?.cid;
  if (d.kind === "video" || d.kind === "story") return d.data.poster;
  return undefined;
}
function captionOf(body: string): string | undefined {
  const d = decodeBody(body);
  if (d.kind === "photo" || d.kind === "carousel" || d.kind === "video") return d.data.cap;
  if (d.kind === "note") return d.data.txt;
  if (d.kind === "text") return d.text;
  return undefined;
}

export default function PostGate({ postId }: { postId: string }) {
  const { status } = useAuth();
  const [authing, setAuthing] = useState<null | "onboard" | "unlock">(null);

  // Hooks must run unconditionally — fetch the teaser data regardless.
  const { data, isLoading } = usePost(postId);
  const post = data?.post;
  const { data: stats } = usePostStats(postId);
  const { data: tips } = usePostTips(postId);
  const { data: profile } = useProfile(post?.author_pubkey);

  // Once they choose to sign in, hand off to the real flow (URL stays /p/:id).
  if (authing === "onboard") return <Onboarding />;
  if (authing === "unlock") return <Unlock />;

  const imgRef = post ? firstImageRef(post.body) : undefined;
  const caption = post ? captionOf(post.body) : undefined;
  const name = profile?.name?.trim() || (post ? shortAddress(post.author_pubkey) : "");
  const returning = status === "locked";

  return (
    <div className="min-h-screen bg-ink">
      <header className="flex items-center justify-between border-b border-ink-border px-4 py-3">
        <Logo size={28} withWordmark />
        <button
          onClick={() => setAuthing(returning ? "unlock" : "onboard")}
          className="rounded-full bg-rouge-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-rouge-500"
        >
          {returning ? "Unlock" : "Join RouGee"}
        </button>
      </header>

      <div className="mx-auto w-full max-w-[520px] px-4 py-6">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        ) : !post ? (
          <div className="py-20 text-center text-sm text-ink-muted">This post couldn’t be loaded.</div>
        ) : (
          <>
            {/* Author */}
            <div className="flex items-center gap-3">
              <Avatar refUri={profile?.avatarRef} seed={post.author_pubkey} name={profile?.name} size={44} />
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{name}</div>
                <div className="text-xs text-ink-muted">{timeAgo(post.created_at)}</div>
              </div>
            </div>

            {/* Gated media */}
            <div className="relative mt-4 overflow-hidden rounded-2xl border border-ink-border bg-ink-soft">
              {imgRef ? (
                <MediaImage
                  refUri={imgRef}
                  alt=""
                  className="h-[420px] w-full scale-110 select-none object-cover blur-2xl"
                />
              ) : (
                <div className="h-[420px] w-full bg-gradient-to-br from-rouge-900/40 to-ink" />
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-ink/55 px-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rouge-600/25">
                  <Lock className="h-7 w-7 text-white" />
                </div>
                <p className="max-w-xs text-lg font-bold leading-snug text-white">
                  Make a RouGee account to view this photo
                </p>
                <button
                  onClick={() => setAuthing(returning ? "unlock" : "onboard")}
                  className="rounded-full bg-rouge-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rouge-600/30 transition hover:bg-rouge-500"
                >
                  {returning ? "Unlock to view" : "Create free account"}
                </button>
                <p className="text-xs text-ink-muted">No email, no sign-up form — just a key that’s yours.</p>
              </div>
            </div>

            {/* Stats — social proof stays visible */}
            <div className="mt-4 flex items-center gap-6 text-sm text-ink-muted">
              <span className="flex items-center gap-1.5">
                <Heart className="h-4 w-4" /> {formatCount(stats?.likes ?? 0)}
              </span>
              <span className="flex items-center gap-1.5">
                <MessageCircle className="h-4 w-4" /> {formatCount(stats?.replies ?? 0)}
              </span>
              {(tips?.total ?? 0) > 0 && (
                <span className="flex items-center gap-1.5 text-amber-300">
                  <Coins className="h-4 w-4" /> {formatCount(tips!.total)} XRGE
                </span>
              )}
            </div>

            {/* Caption teaser */}
            {caption && (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed">
                <span className="font-semibold">{name}</span> <span>{caption}</span>
              </p>
            )}

            <p className="mt-8 text-center text-xs text-ink-muted">
              RouGee runs on RougeChain — your keys, your photos, un-deplatformable.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
