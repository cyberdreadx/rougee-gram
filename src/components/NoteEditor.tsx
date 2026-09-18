import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { useSetNote, useClearNote, type Note } from "@/hooks/useNotes";
import { useToast } from "./Toast";
import Modal from "./Modal";
import { NOTE_LIMIT } from "@/lib/envelope";

/**
 * Compose / clear your 24h note (Instagram-style). Shared by the DM inbox
 * NotesRow and your own profile header.
 */
export default function NoteEditor({
  note,
  onClose,
}: {
  note: Note | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const set = useSetNote();
  const clear = useClearNote();
  const [text, setText] = useState(note?.text ?? "");

  function save() {
    const body = text.trim();
    if (!body) return;
    set.mutate(body, {
      onSuccess: () => {
        toast("Note shared", "success");
        onClose();
      },
      onError: (e) => toast(e instanceof Error ? e.message : "Failed", "error"),
    });
  }

  function remove() {
    if (!note) return;
    clear.mutate(note.postId, {
      onSuccess: () => {
        toast("Note cleared", "success");
        onClose();
      },
      onError: (e) => toast(e instanceof Error ? e.message : "Failed", "error"),
    });
  }

  const busy = set.isPending || clear.isPending;

  return (
    <Modal onClose={onClose} title="New note">
      <p className="mb-3 text-sm text-ink-muted">
        Share a short thought on your profile and at the top of your friends&apos;
        inboxes. Notes disappear after 24 hours.
      </p>
      <textarea
        className="input h-20 resize-none"
        placeholder="Share what's on your mind…"
        value={text}
        maxLength={NOTE_LIMIT}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        disabled={busy}
      />
      <div className="mt-1 text-right text-xs text-ink-muted">
        {text.length}/{NOTE_LIMIT}
      </div>
      <div className="mt-4 flex gap-2">
        {note && (
          <button
            className="btn-soft shrink-0 text-rouge-400"
            onClick={remove}
            disabled={busy}
            aria-label="Clear note"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          className="btn-primary flex-1 py-3"
          onClick={save}
          disabled={busy || !text.trim()}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Share note"}
        </button>
      </div>
    </Modal>
  );
}
