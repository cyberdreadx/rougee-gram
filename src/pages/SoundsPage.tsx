import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Music2, Loader2, TrendingUp } from "lucide-react";
import { useTrendingSounds } from "@/hooks/useSounds";

/** Most-used tracks across reels — a discovery surface for artists. */
export default function SoundsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: sounds, isLoading } = useTrendingSounds(50);

  return (
    <div className="pb-[calc(var(--bottom-nav-h)+2rem)] md:pb-0">
      <header className="sticky top-[var(--top-bar-h)] z-20 flex items-center gap-3 border-b border-ink-border bg-ink/55 px-3 py-3 backdrop-blur md:top-0">
        <button className="btn-ghost h-9 w-9 p-0" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex items-center gap-1.5 text-base font-semibold">
          <TrendingUp className="h-4 w-4 text-rouge-400" /> {t("sound.trending")}
        </h1>
      </header>

      {isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
        </div>
      )}

      {!isLoading && (!sounds || sounds.length === 0) && (
        <p className="px-6 py-16 text-center text-sm text-ink-muted">{t("sound.noTrending")}</p>
      )}

      {sounds && sounds.length > 0 && (
        <ul className="divide-y divide-ink-border/60">
          {sounds.map((s, i) => (
            <li key={s.soundId}>
              <Link
                to={`/sound/${encodeURIComponent(s.soundId)}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
              >
                <span className="w-5 shrink-0 text-center text-sm font-semibold text-ink-muted">
                  {i + 1}
                </span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ink-soft">
                  <Music2 className="h-5 w-5 text-ink-muted" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.title || t("sound.untitled")}</p>
                  {s.artist && <p className="truncate text-xs text-ink-muted">{s.artist}</p>}
                </div>
                <span className="shrink-0 text-xs text-ink-muted">
                  {t("sound.reelCount", { count: s.count })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
