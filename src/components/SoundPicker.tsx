import { useRef, useState } from "react";
import { Search, Play, Pause, Loader2, Music2, Check } from "lucide-react";
import { useSounds, type Sound } from "@/hooks/useSounds";
import Modal from "./Modal";
import { cn } from "@/lib/utils";

/**
 * Pick a "sound" (qRougee track) to attach to a reel. Lists the on-chain music
 * catalog with in-place preview playback and a search filter.
 */
export default function SoundPicker({
  selectedId,
  onSelect,
  onClose,
}: {
  selectedId?: string;
  onSelect: (sound: Sound | null) => void;
  onClose: () => void;
}) {
  const { data: sounds, isLoading, isError } = useSounds();
  const [q, setQ] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const query = q.trim().toLowerCase();
  const filtered = (sounds ?? []).filter((s) =>
    query ? `${s.title} ${s.artist}`.toLowerCase().includes(query) : true,
  );

  function togglePreview(s: Sound) {
    const el = audioRef.current;
    if (!el) return;
    if (previewId === s.id) {
      el.pause();
      setPreviewId(null);
      return;
    }
    el.src = s.audioUrl;
    el.currentTime = 0;
    el.play().then(() => setPreviewId(s.id)).catch(() => setPreviewId(null));
  }

  function choose(s: Sound | null) {
    audioRef.current?.pause();
    onSelect(s);
    onClose();
  }

  return (
    <Modal onClose={onClose} title="Add a sound">
      <audio ref={audioRef} className="hidden" onEnded={() => setPreviewId(null)} />

      <div className="mb-3 flex items-center gap-2 rounded-xl bg-ink-soft px-3">
        <Search className="h-4 w-4 shrink-0 text-ink-muted" />
        <input
          className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-ink-muted"
          placeholder="Search tracks or artists"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {selectedId && (
        <button
          className="mb-2 w-full rounded-lg bg-ink-soft py-2 text-xs font-medium text-ink-muted hover:text-white"
          onClick={() => choose(null)}
        >
          Remove sound
        </button>
      )}

      <div className="max-h-[50vh] space-y-1 overflow-y-auto">
        {isLoading ? (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-ink-muted" />
          </div>
        ) : isError ? (
          <p className="py-10 text-center text-sm text-ink-muted">
            Couldn't load sounds. Try again.
          </p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-ink-muted">
            <Music2 className="h-6 w-6" />
            {sounds && sounds.length === 0
              ? "No tracks on RougeChain yet — add some on music.rougee.app."
              : "No tracks match that search."}
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-3 rounded-xl p-2 transition-colors",
                selectedId === s.id ? "bg-rouge-600/15" : "hover:bg-white/5",
              )}
            >
              <button
                onClick={() => togglePreview(s)}
                className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ink-soft"
                aria-label={previewId === s.id ? "Pause" : "Preview"}
              >
                {s.coverUrl ? (
                  <img src={s.coverUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Music2 className="absolute inset-0 m-auto h-5 w-5 text-ink-muted" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white">
                  {previewId === s.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </span>
              </button>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{s.title}</div>
                <div className="truncate text-xs text-ink-muted">{s.artist || "Unknown artist"}</div>
              </div>

              <button
                onClick={() => choose(s)}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold",
                  selectedId === s.id
                    ? "bg-rouge-600 text-ink"
                    : "bg-white/5 text-white hover:bg-white/10",
                )}
              >
                {selectedId === s.id ? <Check className="h-3.5 w-3.5" /> : "Use"}
              </button>
            </div>
          ))
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-ink-muted">
        Sounds from <span className="text-white">qRougee</span> · music.rougee.app
      </p>
    </Modal>
  );
}
