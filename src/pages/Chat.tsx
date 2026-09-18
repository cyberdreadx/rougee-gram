import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Send, ShieldCheck, Trash2 } from "lucide-react";
import {
  useConversations,
  useMessages,
  useSendMessage,
  useDeleteMessage,
  useDmGate,
  classifyConversation,
  type DecryptedMessage,
} from "@/hooks/useMessenger";
import { useFollowing } from "@/hooks/useSocial";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
import ChatMenu from "@/components/ChatMenu";
import { displayName } from "@/lib/profile";
import { shortAddress, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { publicKey } = useAuth();
  const { data: convos } = useConversations();
  const conv = convos?.find((c) => c.id === id);
  const participants = conv?.participants ?? [];
  const others = participants.filter((p) => p !== publicKey);
  const isGroup = others.length > 1;
  const otherId = others[0] ?? "";

  const { data: profile } = useProfile(otherId || undefined);

  // Message-request gate: if this is a quarantined request (a 1:1 from someone
  // you don't follow, not yet accepted), don't fetch or decrypt its contents —
  // show an accept/reject prompt instead.
  const gate = useDmGate();
  const { data: followingList } = useFollowing(publicKey || undefined);
  const following = useMemo(() => new Set(followingList ?? []), [followingList]);
  const bucket = conv
    ? classifyConversation(conv, {
        publicKey,
        following,
        accepted: gate.accepted,
        blocked: gate.blocked,
      })
    : undefined;
  const isRequest = bucket === "request";

  const { data: messages, isLoading } = useMessages(id, {
    enabled: !!convos && !isRequest,
  });
  const send = useSendMessage(id ?? "", participants);
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const delMsg = useDeleteMessage(id ?? "");

  const bottomRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages?.length]);

  function submit() {
    const body = text.trim();
    if (!body) return;
    send.mutate(body, {
      onSuccess: () => setText(""),
      onError: (e) => toast(e instanceof Error ? e.message : "Send failed", "error"),
    });
  }

  const name = isGroup
    ? `Group · ${participants.length}`
    : profile
      ? displayName(profile)
      : shortAddress(otherId, 8, 4);

  return (
    <div className="flex flex-col pb-[calc(var(--bottom-nav-h)+4.5rem)] md:h-[calc(100dvh-1rem)] md:pb-0">
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center gap-3 border-b border-ink-border bg-ink/80 px-3 py-2.5 backdrop-blur md:top-0">
        <button className="btn-ghost h-9 w-9 p-0" onClick={() => navigate("/messages")}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <Avatar refUri={profile?.avatarRef} seed={otherId} name={profile?.name} size={36} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-semibold">{name}</div>
          <div className="flex items-center gap-1 text-xs text-ink-muted">
            <ShieldCheck className="h-3 w-3" /> Encrypted
          </div>
        </div>
        {/* Requests already have their own accept/reject prompt below. */}
        {id && !isRequest && (
          <ChatMenu conversationId={id} otherId={otherId} isGroup={isGroup} />
        )}
      </header>

      {isRequest ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center">
          <Avatar refUri={profile?.avatarRef} seed={otherId} name={profile?.name} size={72} />
          <div>
            <h2 className="text-lg font-semibold">{name} wants to message you</h2>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-ink-muted">
              You don&apos;t follow this account. Their message stays hidden — and
              isn&apos;t even decrypted — until you accept.
            </p>
          </div>
          <div className="mt-2 flex w-full max-w-xs gap-2">
            <button
              className="btn-soft flex-1 py-3"
              onClick={() => {
                gate.block(otherId);
                navigate("/messages");
              }}
            >
              Delete
            </button>
            <button
              className="btn-primary flex-[2] py-3"
              onClick={() => id && gate.accept(id)}
            >
              Accept
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
              </div>
            ) : messages && messages.length > 0 ? (
              messages.map((m) => (
                <Bubble key={m.id} m={m} group={isGroup} onDelete={setPendingDelete} />
              ))
            ) : (
              <p className="py-10 text-center text-sm text-ink-muted">
                No messages yet. Say hi 👋
              </p>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="fixed inset-x-0 bottom-[var(--bottom-nav-h)] z-20 border-t border-ink-border bg-ink/95 p-3 backdrop-blur md:static md:bottom-0">
        <div className="mx-auto flex max-w-[620px] items-center gap-2">
          <input
            className="input flex-1"
            placeholder="Message…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            disabled={send.isPending}
          />
          <button
            className="btn-primary h-10 w-10 shrink-0 p-0"
            onClick={submit}
            disabled={send.isPending || !text.trim()}
            aria-label="Send"
          >
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
            </div>
          </div>
        </>
      )}

      {pendingDelete && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-ink-border bg-ink-card p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Delete message?</h3>
            <p className="mt-1.5 text-sm text-ink-muted">
              This removes it for you. The other person may still have their copy.
            </p>
            <div className="mt-4 flex gap-2">
              <button className="btn-soft flex-1 py-2.5" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button
                className="btn-primary flex-1 py-2.5"
                disabled={delMsg.isPending}
                onClick={() =>
                  delMsg.mutate(pendingDelete, {
                    onSuccess: () => {
                      toast("Message deleted", "success");
                      setPendingDelete(null);
                    },
                    onError: (e) =>
                      toast(e instanceof Error ? e.message : "Delete failed", "error"),
                  })
                }
              >
                {delMsg.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Bubble({
  m,
  group,
  onDelete,
}: {
  m: DecryptedMessage;
  group: boolean;
  onDelete?: (id: string) => void;
}) {
  const showSender = group && !m.mine;
  const { data: profile } = useProfile(showSender ? m.sender_wallet_id : undefined);
  return (
    <div className={cn("group flex items-center gap-1.5", m.mine ? "justify-end" : "justify-start")}>
      {/* Only your own messages can be removed. Hidden until hover on pointer
          devices; always present for touch (no hover to reveal it). */}
      {m.mine && onDelete && (
        <button
          className="shrink-0 p-1 text-ink-muted opacity-100 transition-opacity hover:text-rouge-400 md:opacity-0 md:group-hover:opacity-100"
          onClick={() => onDelete(m.id)}
          aria-label="Delete message"
          title="Delete message"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
          m.mine
            ? "rounded-br-md bg-rouge-600 text-white"
            : "rounded-bl-md bg-ink-card text-white",
        )}
      >
        {showSender && (
          <div className="mb-0.5 text-[11px] font-semibold text-rouge-300">
            {profile ? displayName(profile) : shortAddress(m.sender_wallet_id, 8, 4)}
          </div>
        )}
        <p className="whitespace-pre-wrap break-words">{m.text}</p>
        <div className={cn("mt-0.5 text-[10px]", m.mine ? "text-white/70" : "text-ink-muted")}>
          {timeAgo(m.created_at)}
        </div>
      </div>
    </div>
  );
}
