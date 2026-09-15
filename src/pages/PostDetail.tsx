import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { usePost, useReplies, useAddComment } from "@/hooks/useSocial";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import PostCard from "@/components/PostCard";
import Avatar from "@/components/Avatar";
import UserLink from "@/components/UserLink";
import { useMyProfile } from "@/hooks/useProfile";
import { timeAgo } from "@/lib/format";
import type { SocialPost } from "@rougechain/sdk";

export default function PostDetail() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = usePost(postId);
  const replies = useReplies(postId);

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
          <PostCard post={data.post} />

          <section className="px-3 pt-4 sm:px-0">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              Comments
            </h2>
            {replies.isLoading ? (
              <div className="py-8 text-center">
                <Loader2 className="mx-auto h-4 w-4 animate-spin text-ink-muted" />
              </div>
            ) : replies.data && replies.data.length > 0 ? (
              <div className="space-y-4 py-2">
                {replies.data.map((c) => (
                  <CommentRow key={c.id} comment={c} />
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-ink-muted">
                No comments yet. Be the first.
              </p>
            )}
          </section>
        </>
      )}

      {postId && data?.post && <Composer postId={postId} />}
    </div>
  );
}

function CommentRow({ comment }: { comment: SocialPost }) {
  const { data: profile } = useProfile(comment.author_pubkey);
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
          {comment.body}
        </p>
        <div className="mt-0.5 text-xs text-ink-muted">
          {timeAgo(comment.created_at)}
        </div>
      </div>
    </div>
  );
}

function Composer({ postId }: { postId: string }) {
  const { address } = useAuth();
  const profile = useMyProfile();
  const { toast } = useToast();
  const add = useAddComment(postId);
  const [text, setText] = useState("");

  function submit() {
    const body = text.trim();
    if (!body) return;
    add.mutate(body, {
      onSuccess: () => setText(""),
      onError: (e) =>
        toast(e instanceof Error ? e.message : "Comment failed", "error"),
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-20 border-t border-ink-border bg-ink/95 p-3 backdrop-blur md:sticky md:bottom-0 md:mt-2">
      <div className="mx-auto flex max-w-[620px] items-center gap-2">
        <Avatar refUri={profile?.avatarRef} seed={address} name={profile?.name} size={32} />
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
          disabled={add.isPending || !text.trim()}
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
  );
}
