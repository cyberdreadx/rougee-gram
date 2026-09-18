import { useState } from "react";
import { MoreHorizontal, Ban, Trash2, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useDeleteConversation, useDmGate } from "@/hooks/useMessenger";
import { useToast } from "./Toast";

/**
 * Per-conversation actions: block the other party, or delete the thread.
 *
 * Blocking is client-side (there is no on-chain block): it hides their DMs on
 * this device. Deleting removes the conversation for you; the other participant
 * keeps their copy — the copy reflects both limits honestly.
 */
export default function ChatMenu({
  conversationId,
  otherId,
  isGroup,
  onDeleted,
}: {
  conversationId: string;
  otherId: string;
  isGroup: boolean;
  onDeleted?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | "block" | "delete">(null);
  const gate = useDmGate();
  const del = useDeleteConversation();
  const { toast } = useToast();
  const navigate = useNavigate();

  function doBlock() {
    gate.block(otherId);
    toast("Blocked. They can't message you here.", "success");
    setConfirm(null);
    setOpen(false);
    navigate("/messages");
  }

  function doDelete() {
    del.mutate(conversationId, {
      onSuccess: () => {
        toast("Conversation deleted", "success");
        setConfirm(null);
        setOpen(false);
        if (onDeleted) onDeleted();
        else navigate("/messages");
      },
      onError: (e) =>
        toast(e instanceof Error ? e.message : "Delete failed", "error"),
    });
  }

  return (
    <div className="relative">
      <button
        className="btn-ghost h-10 w-10 p-0"
        onClick={() => setOpen((o) => !o)}
        aria-label="Conversation options"
      >
        <MoreHorizontal className="h-5 w-5" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-ink-border bg-ink-card shadow-xl">
            {/* Group threads have no single "other party" to block. */}
            {!isGroup && otherId && (
              <button
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5"
                onClick={() => setConfirm("block")}
              >
                <Ban className="h-4 w-4" /> Block
              </button>
            )}
            <button
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-rouge-400 hover:bg-white/5"
              onClick={() => setConfirm("delete")}
            >
              <Trash2 className="h-4 w-4" /> Delete conversation
            </button>
          </div>
        </>
      )}

      {confirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setConfirm(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-ink-border bg-ink-card p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">
              {confirm === "block" ? "Block this account?" : "Delete conversation?"}
            </h3>
            <p className="mt-1.5 text-sm text-ink-muted">
              {confirm === "block"
                ? "Their messages stop showing up for you on this device. You can undo this from the blocked list."
                : "This removes the conversation for you. The other person keeps their own copy."}
            </p>
            <div className="mt-4 flex gap-2">
              <button className="btn-soft flex-1 py-2.5" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn-primary flex-1 py-2.5"
                disabled={del.isPending}
                onClick={confirm === "block" ? doBlock : doDelete}
              >
                {del.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : confirm === "block" ? (
                  "Block"
                ) : (
                  "Delete"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
