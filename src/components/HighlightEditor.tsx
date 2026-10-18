import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, ChevronLeft, ChevronRight, X, ImagePlus, Trash2 } from "lucide-react";
import Modal from "./Modal";
import MediaImage from "./MediaImage";
import { useToast } from "./Toast";
import { useStoryArchive, useManageHighlights } from "@/hooks/useHighlights";
import type { Highlight, StoryItem } from "@/lib/highlights";
import { processImage } from "@/lib/image";
import { putImage } from "@/lib/media";
import { HIGHLIGHT_TITLE_LIMIT, HIGHLIGHT_ITEMS_MAX } from "@/lib/envelope";
import { cn } from "@/lib/utils";

/**
 * Create or edit a Story Highlight: name it, pick stories from your archive
 * (tap to add/remove, arrows to reorder), and choose a cover (auto from the
 * first story, or upload a custom image).
 */
export default function HighlightEditor({
  ownerPubkey,
  existing,
  onClose,
  onDelete,
}: {
  ownerPubkey: string;
  existing?: Highlight;
  onClose: () => void;
  /** Owner-only delete (edit mode). */
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const archive = useStoryArchive(ownerPubkey);
  const { save } = useManageHighlights();
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState(existing?.title ?? "");
  const [selected, setSelected] = useState<string[]>(existing?.items ?? []);
  const [customCover, setCustomCover] = useState<string>(existing?.cover ?? "");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const byId = new Map((archive.data ?? []).map((s) => [s.id, s] as const));
  const firstStory: StoryItem | undefined = selected.length ? byId.get(selected[0]) : undefined;
  // Cover: a custom upload wins; otherwise the first selected story's frame.
  const coverRef = customCover || firstStory?.poster || firstStory?.cid || "";

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= HIGHLIGHT_ITEMS_MAX) {
        toast(t("highlight.maxItems", { count: HIGHLIGHT_ITEMS_MAX }), "error");
        return prev;
      }
      return [...prev, id];
    });
  }
  function move(i: number, dir: -1 | 1) {
    setSelected((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function pickCover(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const img = await processImage(file, { square: true, maxSize: 320, quality: 0.85 });
      const media = await putImage(img.blob, "highlight-cover");
      setCustomCover(media.ref);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("highlight.coverFailed"), "error");
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!selected.length) {
      toast(t("highlight.pickOne"), "error");
      return;
    }
    setBusy(true);
    try {
      await save({ hid: existing?.hid, title, cover: coverRef || undefined, items: selected });
      toast(existing ? t("highlight.updated") : t("highlight.created"), "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("highlight.saveFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      onClose={busy ? () => {} : onClose}
      title={existing ? t("highlight.editTitle") : t("highlight.newTitle")}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4">
        {/* cover + title */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-ink-border bg-ink-soft"
            aria-label={t("highlight.changeCover")}
          >
            {coverRef ? (
              <MediaImage refUri={coverRef} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-ink-muted">
                <ImagePlus className="h-5 w-5" />
              </span>
            )}
            {uploading && (
              <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-4 w-4 animate-spin text-white" />
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <input
              className="input w-full"
              placeholder={t("highlight.namePlaceholder")}
              value={title}
              maxLength={HIGHLIGHT_TITLE_LIMIT}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-1 text-xs font-medium text-rouge-400 hover:text-rouge-300"
            >
              {t("highlight.changeCover")}
            </button>
          </div>
        </div>

        {/* selected, in order */}
        {selected.length > 0 && (
          <div className="hide-scrollbar flex gap-2 overflow-x-auto rounded-xl bg-ink-soft p-2">
            {selected.map((id, i) => {
              const s = byId.get(id);
              return (
                <div key={id} className="relative shrink-0">
                  <div className="h-20 w-14 overflow-hidden rounded-lg bg-black">
                    {s && <MediaImage refUri={s.poster || s.cid} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <button
                    onClick={() => toggle(id)}
                    className="absolute -right-1 -top-1 rounded-full bg-black/70 p-0.5 text-white"
                    aria-label={t("common.remove")}
                  >
                    <X className="h-3 w-3" />
                  </button>
                  <div className="mt-1 flex justify-center gap-1">
                    <button
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="rounded bg-white/5 px-1 text-ink-muted disabled:opacity-30"
                      aria-label={t("highlight.moveLeft")}
                    >
                      <ChevronLeft className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => move(i, 1)}
                      disabled={i === selected.length - 1}
                      className="rounded bg-white/5 px-1 text-ink-muted disabled:opacity-30"
                      aria-label={t("highlight.moveRight")}
                    >
                      <ChevronRight className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* archive picker */}
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("highlight.yourStories")}
          </p>
          {archive.isLoading ? (
            <div className="py-10 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-ink-muted" />
            </div>
          ) : (archive.data ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-muted">{t("highlight.noStories")}</p>
          ) : (
            <div className="grid max-h-[40vh] grid-cols-4 gap-1 overflow-y-auto">
              {(archive.data ?? []).map((s) => {
                const idx = selected.indexOf(s.id);
                const on = idx >= 0;
                return (
                  <button
                    key={s.id}
                    onClick={() => toggle(s.id)}
                    className={cn(
                      "relative aspect-[3/4] overflow-hidden rounded-lg bg-ink-soft",
                      on && "ring-2 ring-rouge-500",
                    )}
                  >
                    <MediaImage refUri={s.poster || s.cid} alt="" className="h-full w-full object-cover" />
                    {on && (
                      <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-rouge-500 text-[10px] font-bold text-white">
                        {idx + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* actions */}
        <div className="flex gap-2">
          {existing && onDelete && (
            <button
              className="btn-soft px-3 py-3 text-rouge-400"
              onClick={onDelete}
              disabled={busy}
              aria-label={t("highlight.delete")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button className="btn-soft flex-1 py-3" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
          <button className="btn-primary flex-[2] py-3" onClick={submit} disabled={busy || uploading}>
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> {t("common.saving")}
              </>
            ) : existing ? (
              t("common.save")
            ) : (
              t("highlight.create")
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
          if (f) pickCover(f);
          e.target.value = "";
        }}
      />
    </Modal>
  );
}
