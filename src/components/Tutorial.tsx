import { useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Camera,
  PlusSquare,
  Compass,
  Heart,
  KeyRound,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import Logo from "./Logo";
import { cn } from "@/lib/utils";

const SEEN_KEY = "rougee-gram:tutorial-seen";

interface Slide {
  icon: LucideIcon;
  /** i18n key suffix — titles/bodies are `tutorial.s{n}t` / `tutorial.s{n}b`. */
  n: number;
}

const SLIDES: Slide[] = [
  { icon: Camera, n: 1 },
  { icon: PlusSquare, n: 2 },
  { icon: Compass, n: 3 },
  { icon: Heart, n: 4 },
  { icon: KeyRound, n: 5 },
];

/**
 * First-run walkthrough. Shows once per browser (localStorage flag), overlaying
 * the app after the user reaches the signed-in state. Skippable.
 */
export default function Tutorial() {
  const { t } = useTranslation();
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return true;
    }
  });
  const [i, setI] = useState(0);

  if (seen) return null;

  function finish() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
    setSeen(true);
  }

  const slide = SLIDES[i];
  const last = i === SLIDES.length - 1;
  const Icon = slide.icon;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/80 backdrop-blur-sm sm:items-center">
      <div className="glass animate-slide-up w-full max-w-md rounded-t-3xl p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:animate-scale-in sm:rounded-3xl sm:pb-6">
        <div className="mb-6 flex items-center justify-between">
          <Logo size={28} withWordmark />
          {!last && (
            <button
              onClick={finish}
              className="text-sm font-medium text-ink-muted hover:text-white"
            >
              {t("tutorial.skip")}
            </button>
          )}
        </div>

        <div
          key={i}
          className="animate-fade-in flex flex-col items-center gap-4 px-2 py-4 text-center"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-rouge-600/15 text-rouge-400">
            <Icon className="h-10 w-10" />
          </span>
          <h2 className="text-xl font-bold">{t(`tutorial.s${slide.n}t`)}</h2>
          <p className="max-w-xs text-sm leading-relaxed text-ink-muted">{t(`tutorial.s${slide.n}b`)}</p>
        </div>

        {/* dots */}
        <div className="my-6 flex items-center justify-center gap-1.5">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={t("tutorial.slide", { n: idx + 1 })}
              className={cn(
                "h-1.5 rounded-full transition-all",
                idx === i ? "w-5 bg-rouge-500" : "w-1.5 bg-white/20 hover:bg-white/40",
              )}
            />
          ))}
        </div>

        <button
          className="btn-primary w-full py-3"
          onClick={() => (last ? finish() : setI((n) => n + 1))}
        >
          {last ? (
            t("tutorial.getStarted")
          ) : (
            <>
              {t("tutorial.next")} <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>,
    document.body,
  );
}
