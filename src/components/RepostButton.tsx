import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Repeat2, Quote, Loader2 } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { useRepost } from "@/hooks/useSocial";
import { useAuth } from "@/store/auth";
import { CAPTION_LIMIT } from "@/lib/envelope";
import { useToast } from "./Toast";
import Modal from "./Modal";
import { cn } from "@/lib/utils";

/**
 * Repost action: a real client-side rebroadcast (see useRepost / RepostEnvelope),
 * not the native counter. Tapping opens a small menu — Repost (or Undo, if you
 * already reposted) and Quote. Quote opens a composer for your comment.
 */
export default function RepostButton({ post }: { post: SocialPost }) {
  const { t } = useTranslation();
  const { wallet } = useAuth();
  const { toast } = useToast();
  const { reposted, busy, repost, undo } = useRepost(post.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quote, setQuote] = useState("");

  const run = async (fn: () => Promise<void>, okKey: string) => {
    try {
      await fn();
      toast(t(okKey), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("repost.failed"), "error");
    }
  };

  const onIconClick = () => {
    if (!wallet) {
      toast(t("repost.locked"), "error");
      return;
    }
    setMenuOpen((o) => !o);
  };

  return (
    <div className="relative">
      <button
        onClick={onIconClick}
        disabled={busy}
        className={cn(
          "flex items-center transition-transform active:scale-90 disabled:opacity-60",
          reposted ? "text-emerald-500" : "text-white hover:text-ink-muted",
        )}
        aria-label={t("repost.repost")}
      >
        {busy ? (
          <Loader2 className="h-6 w-6 animate-spin" />
        ) : (
          <Repeat2 className="h-6 w-6" />
        )}
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute bottom-full left-0 z-20 mb-2 w-44 overflow-hidden rounded-xl border border-ink-border bg-ink shadow-lg">
            <button
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-white/5"
              onClick={() => {
                setMenuOpen(false);
                run(() => (reposted ? undo() : repost()), reposted ? "repost.undone" : "repost.done");
              }}
            >
              <Repeat2 className={cn("h-4 w-4", reposted && "text-emerald-500")} />
              {reposted ? t("repost.undo") : t("repost.repost")}
            </button>
            <button
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-white/5"
              onClick={() => {
                setMenuOpen(false);
                setQuoteOpen(true);
              }}
            >
              <Quote className="h-4 w-4" />
              {t("repost.quote")}
            </button>
          </div>
        </>
      )}

      {quoteOpen && (
        <Modal onClose={() => setQuoteOpen(false)} title={t("repost.quote")}>
          <textarea
            className="input h-28 w-full resize-none"
            placeholder={t("repost.quotePlaceholder")}
            value={quote}
            maxLength={CAPTION_LIMIT}
            onChange={(e) => setQuote(e.target.value)}
            autoFocus
            disabled={busy}
          />
          <div className="mt-1 text-right text-xs text-ink-muted">
            {quote.length}/{CAPTION_LIMIT}
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn-soft flex-1 py-2.5" onClick={() => setQuoteOpen(false)} disabled={busy}>
              {t("common.cancel")}
            </button>
            <button
              className="btn-primary flex-[2] py-2.5"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await repost(quote.trim() || undefined);
                  setQuoteOpen(false);
                  setQuote("");
                }, "repost.done")
              }
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("repost.quote")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
