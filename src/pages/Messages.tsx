import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Pencil, ShieldCheck, MessageCircle, X } from "lucide-react";
import type { MessengerConversation } from "@rougechain/sdk";
import {
  useConversationBuckets,
  useEnsureRegistered,
  useStartConversation,
} from "@/hooks/useMessenger";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import Avatar from "@/components/Avatar";
import NotesRow from "@/components/NotesRow";
import { rc } from "@/lib/rouge";
import { displayName } from "@/lib/profile";
import { shortAddress, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Messages() {
  useEnsureRegistered();
  const { primary, requests, isLoading, gate } = useConversationBuckets();
  const { isExtensionWallet } = useAuth();
  const navigate = useNavigate();
  const [composing, setComposing] = useState(false);
  const [tab, setTab] = useState<"primary" | "requests">("primary");
  const list = tab === "primary" ? primary : requests;

  return (
    <div>
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center justify-between border-b border-ink-border bg-ink/80 px-4 py-3.5 backdrop-blur md:top-0">
        <div>
          <h1 className="text-base font-semibold">Messages</h1>
          <p className="flex items-center gap-1 text-xs text-ink-muted">
            <ShieldCheck className="h-3 w-3" /> End-to-end encrypted (ML-KEM-768)
          </p>
        </div>
        {!isExtensionWallet && (
          <button className="btn-ghost h-10 w-10 p-0" onClick={() => setComposing(true)} aria-label="New message">
            <Pencil className="h-5 w-5" />
          </button>
        )}
      </header>

      <NotesRow />

      {isExtensionWallet ? (
        <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rouge-600/15 text-rouge-400">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">DMs need an in-app wallet</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
              Encrypted messaging derives a key from your wallet's seed, which the
              browser extension keeps private. Create or import an in-app account to
              use DMs.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex border-b border-ink-border">
            <TabBtn active={tab === "primary"} onClick={() => setTab("primary")}>
              Primary
            </TabBtn>
            <TabBtn active={tab === "requests"} onClick={() => setTab("requests")}>
              Requests
              {requests.length > 0 && (
                <span className="ml-1.5 rounded-full bg-rouge-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {requests.length}
                </span>
              )}
            </TabBtn>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
            </div>
          ) : list.length > 0 ? (
            <div className="divide-y divide-ink-border/60">
              {tab === "primary"
                ? list.map((c) => <ConversationRow key={c.id} conversation={c} />)
                : list.map((c) => (
                    <RequestRow
                      key={c.id}
                      conversation={c}
                      onAccept={(id) => {
                        gate.accept(id);
                        navigate(`/messages/${id}`);
                      }}
                      onReject={(pk) => gate.block(pk)}
                    />
                  ))}
            </div>
          ) : tab === "requests" ? (
            <div className="flex flex-col items-center gap-3 px-6 py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-rouge-600/15 text-rouge-400">
                <ShieldCheck className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No message requests</h3>
                <p className="mx-auto mt-1 max-w-xs text-sm text-ink-muted">
                  Messages from people you don&apos;t follow wait here — their
                  contents stay hidden until you accept.
                </p>
              </div>
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
        </>
      )}

      {composing && <NewMessageDialog onClose={() => setComposing(false)} />}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-1 items-center justify-center py-3 text-sm font-semibold transition-colors",
        active ? "text-white" : "text-ink-muted hover:text-white",
      )}
    >
      {children}
      {active && (
        <span className="absolute inset-x-0 bottom-0 mx-auto h-0.5 w-16 rounded-full bg-rouge-500" />
      )}
    </button>
  );
}

/** A quarantined DM from someone you don't follow. Sender + avatar only — the
 *  message contents stay hidden (and un-decrypted) until Accept. */
function RequestRow({
  conversation,
  onAccept,
  onReject,
}: {
  conversation: MessengerConversation;
  onAccept: (conversationId: string) => void;
  onReject: (pubkey: string) => void;
}) {
  const { publicKey } = useAuth();
  const otherId = (conversation.participants ?? []).find((p) => p !== publicKey) ?? publicKey;
  const { data: profile } = useProfile(otherId);
  const name = profile ? displayName(profile) : shortAddress(otherId, 8, 4);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar refUri={profile?.avatarRef} seed={otherId} name={profile?.name} size={48} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="truncate text-xs text-ink-muted">wants to send you a message</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-semibold text-ink-muted hover:bg-white/10 hover:text-white"
          onClick={() => onReject(otherId)}
        >
          Delete
        </button>
        <button
          className="rounded-lg bg-rouge-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rouge-500"
          onClick={() => onAccept(conversation.id)}
        >
          Accept
        </button>
      </div>
    </div>
  );
}

function ConversationRow({ conversation }: { conversation: MessengerConversation }) {
  const { publicKey } = useAuth();
  const others = (conversation.participants ?? []).filter((p) => p !== publicKey);
  const isGroup = others.length > 1;
  const otherId = others[0] ?? publicKey;
  const { data: profile } = useProfile(otherId);
  const name = isGroup
    ? `Group · ${others.length + 1}`
    : profile
      ? displayName(profile)
      : shortAddress(otherId, 8, 4);

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
  const { publicKey } = useAuth();
  const start = useStartConversation();
  const [input, setInput] = useState("");
  const [recipients, setRecipients] = useState<{ pubkey: string; label: string }[]>([]);
  const [busy, setBusy] = useState(false);

  async function addRecipient(): Promise<string | null> {
    const q = input.trim();
    if (!q) return null;
    const res = await rc().resolveAddress(q);
    const pubkey = (res as { publicKey?: string }).publicKey;
    if (!pubkey) throw new Error("Couldn't find that account.");
    if (pubkey === publicKey) throw new Error("That's you.");
    if (!recipients.some((r) => r.pubkey === pubkey)) {
      setRecipients((prev) => [...prev, { pubkey, label: shortAddress(q, 10, 5) }]);
    }
    setInput("");
    return pubkey;
  }

  async function go() {
    setBusy(true);
    try {
      // Fold in any address still in the input box.
      const list = [...recipients.map((r) => r.pubkey)];
      if (input.trim()) {
        const pk = await addRecipient();
        if (pk && !list.includes(pk)) list.push(pk);
      }
      if (!list.length) throw new Error("Add at least one recipient.");
      const id = await start.mutateAsync(list);
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
        Add one or more <span className="font-mono">rouge1…</span> addresses. Two or
        more starts a group. Recipients must have opened Messages at least once.
      </p>

      {recipients.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {recipients.map((r) => (
            <span
              key={r.pubkey}
              className="flex items-center gap-1 rounded-full bg-rouge-600/20 px-2.5 py-1 text-xs text-rouge-200"
            >
              {r.label}
              <button
                onClick={() => setRecipients((prev) => prev.filter((x) => x.pubkey !== r.pubkey))}
                aria-label="Remove"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          className="input flex-1 font-mono text-xs"
          placeholder="rouge1…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addRecipient().catch((err) =>
                toast(err instanceof Error ? err.message : "Invalid address", "error"),
              );
            }
          }}
          autoFocus
          spellCheck={false}
        />
        <button
          className="btn-soft shrink-0"
          onClick={() =>
            addRecipient().catch((err) =>
              toast(err instanceof Error ? err.message : "Invalid address", "error"),
            )
          }
          disabled={!input.trim()}
        >
          Add
        </button>
      </div>

      <button
        className="btn-primary mt-4 w-full py-3"
        onClick={go}
        disabled={busy || (recipients.length === 0 && !input.trim())}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : recipients.length > 1 ? (
          "Start group"
        ) : (
          "Start chat"
        )}
      </button>
    </Modal>
  );
}
