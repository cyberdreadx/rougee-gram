import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onClose: () => void;
  title?: string;
  children: ReactNode;
  maxWidth?: string;
  hideClose?: boolean;
}

export default function Modal({
  onClose,
  title,
  children,
  maxWidth = "max-w-md",
  hideClose,
}: Props) {
  const { t } = useTranslation();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  // Portal to <body> so a Modal opened from inside another modal/overlay (whose
  // backdrop-blur/transform would otherwise trap `position: fixed`) still covers
  // the full viewport instead of being confined to the parent's box.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cn(
          "glass relative z-10 max-h-[90dvh] w-full animate-slide-up overflow-y-auto overscroll-contain rounded-t-2xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:max-h-[85vh] sm:animate-scale-in sm:rounded-2xl sm:pb-5",
          maxWidth,
        )}
      >
        {(title || !hideClose) && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">{title}</h2>
            {!hideClose && (
              <button
                onClick={onClose}
                className="-mr-1 flex items-center justify-center rounded-lg p-2 text-ink-muted hover:bg-white/5 hover:text-white"
                aria-label={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
