import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, Pause, Volume2, VolumeX, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Instagram-style reel preview: plays the (trimmed) video muted with the chosen
 * qRougee track mixed over it, looping the two in sync, and lets the author
 * scrub which part of the song plays via a draggable window ("align the music").
 * The picked offset is reported through `onChangeStart` and stored as the
 * SoundRef `start`, which the Reels feed already honors on playback.
 */
function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function ReelMusicPreview({
  videoUrl,
  clipStart,
  clipEnd,
  cover,
  audioUrl,
  soundStart,
  onChangeStart,
  title,
  artist,
}: {
  videoUrl: string;
  clipStart: number;
  clipEnd: number;
  /** object-cover (9:16 crop / vertical) vs object-contain. */
  cover: boolean;
  audioUrl: string;
  soundStart: number;
  onChangeStart: (start: number) => void;
  title?: string;
  artist?: string;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);

  const [playing, setPlaying] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  const [audioDur, setAudioDur] = useState(0);

  const clipDur = Math.max(0.5, (clipEnd || 0) - clipStart);
  const maxStart = Math.max(0, audioDur - clipDur);

  // Read the track length once it loads so we can size the scrub window.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onMeta = () => setAudioDur(a.duration || 0);
    a.addEventListener("loadedmetadata", onMeta);
    if (a.readyState >= 1) onMeta();
    return () => a.removeEventListener("loadedmetadata", onMeta);
  }, [audioUrl]);

  // Music mute toggle (the video itself is always silent — the track is the audio).
  useEffect(() => {
    const a = audioRef.current;
    if (a) a.muted = !musicOn;
  }, [musicOn]);

  // Re-cue the track whenever the chosen offset changes (live while dragging).
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    try {
      a.currentTime = soundStart;
    } catch {
      /* not seekable yet */
    }
  }, [soundStart]);

  // Play/pause both together, cued to the clip + music offsets.
  useEffect(() => {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    if (playing) {
      if (v.currentTime < clipStart || (clipEnd && v.currentTime >= clipEnd)) v.currentTime = clipStart;
      v.play().catch(() => {});
      if (a) {
        try {
          a.currentTime = soundStart;
        } catch {
          /* ignore */
        }
        a.play().catch(() => {});
      }
    } else {
      v.pause();
      a?.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Loop the trimmed segment and restart the track in sync each loop.
  function onTimeUpdate() {
    const v = videoRef.current;
    const a = audioRef.current;
    if (!v) return;
    if (clipEnd && v.currentTime >= clipEnd) {
      v.currentTime = clipStart;
      if (a && playing) {
        try {
          a.currentTime = soundStart;
        } catch {
          /* ignore */
        }
      }
    }
  }

  // ── Scrub window drag ──
  function moveTo(clientX: number) {
    if (!drag.current || !trackRef.current || audioDur <= 0) return;
    const w = trackRef.current.clientWidth || 1;
    const deltaSec = ((clientX - drag.current.x) / w) * audioDur;
    const next = Math.min(maxStart, Math.max(0, drag.current.start + deltaSec));
    onChangeStart(Math.round(next * 10) / 10);
  }
  function onPointerDown(e: React.PointerEvent) {
    drag.current = { x: e.clientX, start: soundStart };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (drag.current) moveTo(e.clientX);
  }
  function onPointerUp() {
    drag.current = null;
  }

  const leftPct = audioDur ? (soundStart / audioDur) * 100 : 0;
  const widthPct = audioDur ? Math.min(100, (clipDur / audioDur) * 100) : 100;

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "relative flex items-center justify-center overflow-hidden rounded-xl bg-black",
          cover ? "aspect-[9/16] max-h-[60vh]" : "max-h-[52vh]",
        )}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          className={cn("h-full w-full", cover ? "object-cover" : "object-contain")}
          muted
          loop
          playsInline
          onClick={() => setPlaying((p) => !p)}
          onTimeUpdate={onTimeUpdate}
        />
        <audio ref={audioRef} src={audioUrl} preload="auto" />

        {/* play/pause affordance */}
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="absolute inset-0 flex items-center justify-center"
          aria-label={playing ? t("common.close") : t("reelPreview.play")}
        >
          {!playing && (
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur">
              <Play className="h-7 w-7 fill-white" />
            </span>
          )}
        </button>

        {/* music mute */}
        <button
          type="button"
          onClick={() => setMusicOn((m) => !m)}
          className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
          aria-label={musicOn ? t("common.mute") : t("common.unmute")}
        >
          {musicOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
        </button>

        {/* playing indicator */}
        <span className="pointer-events-none absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/50 px-2 py-0.5 text-[11px] text-white backdrop-blur">
          {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          {t("reelPreview.preview")}
        </span>
      </div>

      {/* Align-music scrubber */}
      <div className="rounded-xl bg-ink-soft p-3">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="flex min-w-0 items-center gap-1.5">
            <Music2 className="h-3.5 w-3.5 shrink-0 text-rouge-400" />
            <span className="truncate font-medium">{title || t("reelPreview.music")}</span>
            {artist && <span className="truncate text-ink-muted"> · {artist}</span>}
          </span>
          <span className="shrink-0 text-ink-muted">{t("reelPreview.startsAt", { time: fmt(soundStart) })}</span>
        </div>

        <div
          ref={trackRef}
          className="relative h-10 w-full touch-none overflow-hidden rounded-lg bg-black/40"
        >
          {/* tick marks — a lightweight stand-in for a waveform */}
          <div className="pointer-events-none absolute inset-0 flex items-center gap-[3px] px-1 opacity-40">
            {Array.from({ length: 48 }).map((_, i) => (
              <span
                key={i}
                className="w-full rounded-full bg-white/50"
                style={{ height: `${20 + ((i * 37) % 60)}%` }}
              />
            ))}
          </div>
          {/* draggable selection window */}
          <div
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            className="absolute inset-y-0 cursor-grab touch-none rounded-lg border-2 border-rouge-500 bg-rouge-500/25 active:cursor-grabbing"
            style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: 28 }}
            role="slider"
            aria-label={t("reelPreview.align")}
            aria-valuemin={0}
            aria-valuemax={Math.round(maxStart)}
            aria-valuenow={Math.round(soundStart)}
          >
            <span className="absolute left-1/2 top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
          </div>
        </div>
        <p className="mt-1.5 text-[11px] text-ink-muted">{t("reelPreview.hint")}</p>
      </div>
    </div>
  );
}
