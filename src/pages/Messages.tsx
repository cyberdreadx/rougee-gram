import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Pencil, ShieldCheck, MessageCircle } from "lucide-react";
import type { MessengerConversation } from "@rougechain/sdk";
import {
  useConversations,
  useEnsureRegistered,
  useStartConversation,
} from "@/hooks/useMessenger";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import Avatar from "@/components/Avatar";
import { rc } from "@/lib/rouge";
import { displayName } from "@/lib/profile";
import { shortAddress, timeAgo } from "@/lib/format";

export default function Messages() {
  useEnsureRegistered();
  const { data, isLoading } = useConversations();
  const [composing, setComposing] = useState(false);

  return (
    <div>
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center justify-between border-b border-ink-border bg-ink/80 px-4 py-3.5 backdrop-blur md:top-0">
        <div>
          <h1 className="text-base font-semibold">Messages</h1>
          <p className="flex items-center gap-1 text-xs text-ink-muted">
            <ShieldCheck className="h-3 w-3" /> End-to-end encrypted (ML-KEM-768)
          </p>
        </div>
        <button className="btn-ghost h-10 w-10 p-0" onClick={() => setComposing(true)} aria-label="New message">
          <Pencil className="h-5 w-5" />
        </button>
      </header>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        </div>
      ) : data && data.length > 0 ? (
        <div className="divide-y divide-ink-border/60">
          {data.map((c) => (
            <ConversationRow key={c.id} conversation={c} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rouge-600/15 text-rouge-400">
            <MessageCircle className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">No messages yet</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
              Start a private, end-to-end encrypted conversation. Not even the
              network can read it.
            </p>
          </div>
          <button className="btn-primary" onClick={() => setComposing(true)}>
            New message
          </button>
        </div>
      )}

      {composing && <NewMessageDialog onClose={() => setComposing(false)} />}
    </div>
  );
}

function ConversationRow({ conversation }: { conversation: MessengerConversation }) {
  const { publicKey } = useAuth();
  const otherId = conversation.participants?.find((p) => p !== publicKey) ?? publicKey;
  const { data: profile } = useProfile(otherId);
  const name = profile ? displayName(profile) : shortAddress(otherId, 8, 4);

  return (
    <Link
      to={`/messages/${conversation.id}`}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
    >
      <Avatar refUri={profile?.avatarRef} seed={otherId} name={profile?.name} size={48} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold">{name}</span>
          {conversation.last_message_at && (
            <span className="shrink-0 text-xs text-ink-muted">
              {timeAgo(conversation.last_message_at)}
            </span>
          )}
        </div>
        <div className="truncate text-xs text-ink-muted">🔒 Encrypted conversation</div>
      </div>
      {(conversation.unread_count ?? 0) > 0 && (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rouge-500" />
      )}
    </Link>
  );
}

function NewMessageDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const start = useStartConversation();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    const q = input.trim();
    if (!q) return;
    setBusy(true);
    try {
      const res = await rc().resolveAddress(q);
      const pubkey = (res as { publicKey?: string }).publicKey;
      if (!pubkey) throw new Error("Couldn't find that account.");
      const id = await start.mutateAsync(pubkey);
      onClose();
      navigate(`/messages/${id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not start chat.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} title="New message">
      <p className="mb-3 text-sm text-ink-muted">
        Enter a <span className="font-mono">rouge1…</span> address to start an
        encrypted chat. The other person must have opened Messages at least once.
      </p>
      <input
        className="input font-mono text-xs"
        placeholder="rouge1…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && go()}
        autoFocus
        spellCheck={false}
      />
      <button className="btn-primary mt-4 w-full py-3" onClick={go} disabled={busy || !input.trim()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Start chat"}
      </button>
    </Modal>
  );
}
