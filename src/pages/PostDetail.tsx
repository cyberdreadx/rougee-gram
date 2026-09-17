import { useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Send, Heart, ImagePlus, X } from "lucide-react";
import {
  usePost,
  useReplies,
  useAddComment,
  usePostStats,
  useToggleLike,
} from "@/hooks/useSocial";
import { rc } from "@/lib/rouge";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import PostCard from "@/components/PostCard";
import Avatar from "@/components/Avatar";
import UserLink from "@/components/UserLink";
import { useMyProfile } from "@/hooks/useProfile";
import MediaImage from "@/components/MediaImage";
import GifPicker from "@/components/GifPicker";
import { timeAgo, formatCount } from "@/lib/format";
import {
  decodeBody,
  postOptions,
  encodeComment,
  decodeComment,
  isCommentEnvelope,
} from "@/lib/envelope";
import { processImage } from "@/lib/image";
import { putImage } from "@/lib/media";
import { cn } from "@/lib/utils";
import type { SocialPost } from "@rougechain/sdk";

/**
 * Walk up the reply chain (`reply_to_id` → parent → …) so a post opened in the
 * middle of a thread shows the posts above it for context. Bounded to avoid a
 * runaway loop on malformed data.
 */
function useAncestors(post?: SocialPost) {
  const { publicKey } = useAuth();
  const startId = post?.reply_to_id || undefined;
  return useQuery({
    queryKey: ["ancestors", post?.id, startId],
    enabled: Boolean(startId),
    queryFn: async (): Promise<SocialPost[]> => {
      const chain: SocialPost[] = [];
      let cur: string | undefined = startId;
      let guard = 0;
      while (cur && guard < 20) {
        const r = await rc().social.getPost(cur, publicKey);
        if (!r?.post) break;
        chain.unshift(r.post);
        cur = r.post.reply_to_id || undefined;
        guard += 1;
      }
      return chain;
    },
  });
}

export default function PostDetail() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = usePost(postId);
  const replies = useReplies(postId);
  const ancestors = useAncestors(data?.post);
  const opts = data?.post ? postOptions(decodeBody(data.post.body)) : null;
  const noComments = opts?.noComments ?? false;
  const noMediaComments = opts?.noMediaComments ?? false;

  // Split replies: the author's own replies are thread continuation (rendered as
  // connected posts under the root); everyone else's are comments.
  const rootAuthor = data?.post?.author_pubkey;
  const { thread, comments } = useMemo(() => {
    const all = replies.data ?? [];
    const asc = (a: SocialPost, b: SocialPost) =>
      Date.parse(a.created_at) - Date.parse(b.created_at);
    // A thread part is one of the author's own replies that is a normal post
    // body — NOT a `{t:"c"}` media-comment envelope (those must render via
    // CommentRow, or PostCard would print their raw JSON).
    const isThreadPart = (r: SocialPost) =>
      r.author_pubkey === rootAuthor && !isCommentEnvelope(r.body);
    return {
      thread: all.filter(isThreadPart).sort(asc),
      comments: all.filter((r) => !isThreadPart(r)),
    };
  }, [replies.data, rootAuthor]);

  return (
    <div className="pb-[calc(var(--bottom-nav-h)+5.5rem)] md:pb-0">
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center gap-3 border-b border-ink-border bg-ink/80 px-3 py-3 backdrop-blur md:top-0">
        <button className="btn-ghost h-9 w-9 p-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">Post</h1>
      </header>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        </div>
      )}

      {isError && (
        <div className="py-16 text-center text-sm text-ink-muted">
          Couldn't load this post.
        </div>
      )}

      {data?.post && (
        <>
          {/* Thread context: posts above this one (when opened mid-thread). */}
          {ancestors.data && ancestors.data.length > 0 && (
            <div>
              {ancestors.data.map((a) => (
                <PostCard key={a.id} post={a} />
              ))}
            </div>
          )}

          <PostCard post={data.post} />

          {/* Thread continuation — the author's own follow-up posts. */}
          {thread.length > 0 && (
            <section>
              {thread.map((t) => (
                <PostCard key={t.id} post={t} />
              ))}
            </section>
          )}

          {noComments ? (
            <section className="px-3 py-10 text-center sm:px-0">
              <p className="text-sm font-medium">Comments are turned off</p>
              <p className="mt-1 text-sm text-ink-muted">
                The author turned off commenting for this post.
              </p>
            </section>
          ) : (
            <section className="px-3 pt-4 sm:px-0">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Comments
              </h2>
              {replies.isLoading ? (
                <div className="py-8 text-center">
                  <Loader2 className="mx-auto h-4 w-4 animate-spin text-ink-muted" />
                </div>
              ) : comments.length > 0 ? (
                <div className="space-y-4 py-2">
                  {comments.map((c) => (
                    <CommentRow key={c.id} comment={c} />
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-ink-muted">
                  No comments yet. Be the first.
                </p>
              )}
            </section>
          )}
        </>
      )}

      {postId && data?.post && !noComments && (
        <Composer postId={postId} allowMedia={!noMediaComments} />
      )}
    </div>
  );
}

function CommentRow({ comment }: { comment: SocialPost }) {
  const { data: profile } = useProfile(comment.author_pubkey);
  const { data: stats } = usePostStats(comment.id);
  const like = useToggleLike(comment.id);
  const liked = stats?.liked ?? false;
  const content = decodeComment(comment.body);
  return (
    <div className="flex items-start gap-3">
      <Avatar
        refUri={profile?.avatarRef}
        seed={comment.author_pubkey}
        name={profile?.name}
        size={34}
      />
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          <UserLink
            pubkey={comment.author_pubkey}
            className="mr-1.5 font-semibold"
          />
          {content.text}
        </p>
        {content.img && (
          <MediaImage
            refUri={content.img}
            alt=""
            rounded
            className="mt-1.5 max-h-52 max-w-[75%] rounded-xl object-cover"
          />
        )}
        {content.gif && (
          <img
            src={content.gif}
            alt="GIF"
            loading="lazy"
            className="mt-1.5 max-h-52 max-w-[75%] rounded-xl"
          />
        )}
        <div className="mt-0.5 flex items-center gap-3 text-xs text-ink-muted">
          <span>{timeAgo(comment.created_at)}</span>
          {(stats?.likes ?? 0) > 0 && (
            <span>
              {formatCount(stats!.likes)} {stats!.likes === 1 ? "like" : "likes"}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => like.mutate()}
        className={cn(
          "mt-1 shrink-0 transition-transform active:scale-90",
          liked ? "text-rouge-500" : "text-ink-muted hover:text-white",
        )}
        aria-label="Like comment"
      >
        <Heart className={cn("h-4 w-4", liked && "fill-rouge-500")} />
      </button>
    </div>
  );
}

function Composer({ postId, allowMedia }: { postId: string; allowMedia: boolean }) {
  const { address } = useAuth();
  const profile = useMyProfile();
  const { toast } = useToast();
  const add = useAddComment(postId);
  const [text, setText] = useState("");
  const [img, setImg] = useState<{ ref: string; url: string } | null>(null);
  const [gif, setGif] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasMedia = Boolean(img || gif);
  const canSend = (text.trim() || hasMedia) && !add.isPending && !uploading;

  async function pickImage(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      // Compress small — comment images are shown thumbnail-size.
      const p = await processImage(file, { maxSize: 900, quality: 0.7 });
      const media = await putImage(p.blob, "comment");
      setGif(null);
      setImg({ ref: media.ref, url: URL.createObjectURL(p.blob) });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't attach image", "error");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    const body = encodeComment({ text, img: img?.ref, gif: gif ?? undefined });
    if (!body.trim()) return;
    add.mutate(body, {
      onSuccess: () => {
        setText("");
        setImg(null);
        setGif(null);
      },
      onError: (e) => toast(e instanceof Error ? e.message : "Comment failed", "error"),
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-20 border-t border-ink-border bg-ink/95 p-3 backdrop-blur md:sticky md:bottom-0 md:mt-2">
      <div className="mx-auto max-w-[620px]">
        {/* attachment preview */}
        {(img || gif) && (
          <div className="relative mb-2 inline-block">
            <img
              src={img?.url || gif || ""}
              alt=""
              className="max-h-28 rounded-lg"
            />
            <button
              onClick={() => {
                setImg(null);
                setGif(null);
              }}
              className="absolute -right-2 -top-2 rounded-full bg-black/70 p-1 text-white"
              aria-label="Remove attachment"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Avatar refUri={profile?.avatarRef} seed={address} name={profile?.name} size={32} />
          {allowMedia && (
            <>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading || add.isPending}
                className="shrink-0 text-ink-muted hover:text-white disabled:opacity-50"
                aria-label="Add photo"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ImagePlus className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => setShowGif(true)}
                disabled={add.isPending}
                className="shrink-0 rounded px-1.5 text-xs font-bold text-ink-muted hover:text-white disabled:opacity-50"
                aria-label="Add GIF"
              >
                GIF
              </button>
            </>
          )}
          <input
            className="input flex-1"
            placeholder="Add a comment…"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={add.isPending}
          />
          <button
            className="btn-primary h-10 w-10 shrink-0 p-0"
            onClick={submit}
            disabled={!canSend}
            aria-label="Post comment"
          >
            {add.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) pickImage(f);
          e.target.value = "";
        }}
      />
      {showGif && (
        <GifPicker
          onSelect={(url) => {
            setImg(null);
            setGif(url);
          }}
          onClose={() => setShowGif(false)}
        />
      )}
    </div>
  );
}
