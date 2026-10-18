import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import MediaImage from "./MediaImage";
import HighlightViewer from "./HighlightViewer";
import HighlightEditor from "./HighlightEditor";
import { useToast } from "./Toast";
import { useHighlights, useManageHighlights } from "@/hooks/useHighlights";
import type { Highlight } from "@/lib/highlights";

/**
 * Instagram-style Story Highlights row on a profile: circular covers that play
 * the collection on tap. The owner also gets a "New" bubble and per-highlight
 * Edit (rename / add-remove / reorder / cover / delete via HighlightEditor).
 */
export default function HighlightsRow({ pubkey, isMe }: { pubkey: string; isMe: boolean }) {
  const { t } = useTranslation();
  const { data: highlights, isLoading } = useHighlights(pubkey);
  const { remove } = useManageHighlights();
  const { toast } = useToast();
  const [viewing, setViewing] = useState<Highlight | null>(null);
  const [editing, setEditing] = useState<Highlight | null>(null);
  const [creating, setCreating] = useState(false);

  const has = (highlights?.length ?? 0) > 0;
  // Nothing to show (and nothing to add) on someone else's empty profile.
  if (!isMe && !has) return null;
  if (isLoading && !has) return null;

  const del = async (h: Highlight) => {
    try {
      await remove(h.hid);
      setEditing(null);
      toast(t("highlight.deleted"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("highlight.saveFailed"), "error");
    }
  };

  return (
    <>
      <div className="hide-scrollbar flex gap-4 overflow-x-auto px-4 py-3">
        {isMe && (
          <button
            onClick={() => setCreating(true)}
            className="flex shrink-0 flex-col items-center gap-1"
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-dashed border-ink-border text-ink-muted">
              <Plus className="h-6 w-6" />
            </span>
            <span className="max-w-[4.5rem] truncate text-xs text-ink-muted">
              {t("highlight.new")}
            </span>
          </button>
        )}

        {(highlights ?? []).map((h) => (
          <div key={h.hid} className="flex shrink-0 flex-col items-center gap-1">
            <button
              onClick={() => setViewing(h)}
              className="h-16 w-16 overflow-hidden rounded-full border border-ink-border bg-ink-soft"
            >
              {h.cover ? (
                <MediaImage refUri={h.cover} alt="" className="h-full w-full object-cover" />
              ) : null}
            </button>
            <span className="max-w-[4.5rem] truncate text-xs">
              {h.title || t("highlight.default")}
            </span>
            {isMe && (
              <button
                onClick={() => setEditing(h)}
                className="text-[10px] text-ink-muted hover:text-white"
              >
                {t("common.edit")}
              </button>
            )}
          </div>
        ))}
      </div>

      {viewing && (
        <HighlightViewer ownerPubkey={pubkey} highlight={viewing} onClose={() => setViewing(null)} />
      )}
      {creating && <HighlightEditor ownerPubkey={pubkey} onClose={() => setCreating(false)} />}
      {editing && (
        <HighlightEditor
          ownerPubkey={pubkey}
          existing={editing}
          onClose={() => setEditing(null)}
          onDelete={() => del(editing)}
        />
      )}
    </>
  );
}
