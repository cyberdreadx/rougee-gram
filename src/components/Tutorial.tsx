import { useState } from "react";
import { createPortal } from "react-dom";
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
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    icon: Camera,
    title: "Welcome to RouGee",
    body: "An un-deplatformable photo network on RougeChain. Your account is a key you hold — no one can shadowban or disable it.",
  },
  {
    icon: PlusSquare,
    title: "Share anything",
    body: "Tap + to post photos and carousels, write text posts and X-style threads, drop a 24h story, or shoot a reel.",
  },
  {
    icon: Compass,
    title: "Find your feed",
    body: "Home has Following and Discover. Explore surfaces trending posts and people, and Reels is a full-screen vertical feed.",
  },
  {
    icon: Heart,
    title: "Connect privately",
    body: "Follow, like, comment, and tip XRGE. DMs are end-to-end encrypted (ML-KEM-768) — not even the network can read them.",
  },
  {
    icon: KeyRound,
    title: "You own it all",
    body: "Your photos and identity live on-chain, signed by your key. Back up your recovery phrase in Settings — it's the only way in.",
  },
];

/**
 * First-run walkthrough. Shows once per browser (localStorage flag), overlaying
 * the app after the user reaches the signed-in state. Skippable.
 */
export default function Tutorial() {
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
      <div className="animate-slide-up w-full max-w-md rounded-t-3xl border border-ink-border bg-ink-card p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:animate-scale-in sm:rounded-3xl sm:pb-6">
        <div className="mb-6 flex items-center justify-between">
          <Logo size={28} withWordmark />
          {!last && (
            <button
              onClick={finish}
              className="text-sm font-medium text-ink-muted hover:text-white"
            >
              Skip
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
          <h2 className="text-xl font-bold">{slide.title}</h2>
          <p className="max-w-xs text-sm leading-relaxed text-ink-muted">{slide.body}</p>
        </div>

        {/* dots */}
        <div className="my-6 flex items-center justify-center gap-1.5">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`Slide ${idx + 1}`}
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
            "Get started"
          ) : (
            <>
              Next <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>,
    document.body,
  );
}
