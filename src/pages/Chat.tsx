import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Send, ShieldCheck } from "lucide-react";
import {
  useConversations,
  useMessages,
  useSendMessage,
  type DecryptedMessage,
} from "@/hooks/useMessenger";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import Avatar from "@/components/Avatar";
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
  const { data: messages, isLoading } = useMessages(id);
  const send = useSendMessage(id ?? "", participants);
  const { toast } = useToast();
  const [text, setText] = useState("");

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
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
          </div>
        ) : messages && messages.length > 0 ? (
          messages.map((m) => <Bubble key={m.id} m={m} group={isGroup} />)
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
    </div>
  );
}

function Bubble({ m, group }: { m: DecryptedMessage; group: boolean }) {
  const showSender = group && !m.mine;
  const { data: profile } = useProfile(showSender ? m.sender_wallet_id : undefined);
  return (
    <div className={cn("flex", m.mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3.5 py-2 text-sm",
          m.mine
            ? "rounded-br-md bg-rouge-600 text-ink"
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
