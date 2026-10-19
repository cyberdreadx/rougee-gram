import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ImageOff, Lock } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

interface Props {
  refUri: string;
  alt?: string;
  className?: string;
  /** Rounded square placeholder while resolving. */
  rounded?: boolean;
  /** Inline styles for the <img> (e.g. objectPosition for cover framing). */
  style?: React.CSSProperties;
}

/** Resolves a media reference (ipfs://… / local://…) and renders it with a
 *  loading skeleton and a graceful "unavailable" fallback. */
export default function MediaImage({ refUri, alt, className, rounded, style }: Props) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  // Gated ("subscribers only") media can't be fetched by a plain URL — show a
  // lock placeholder (e.g. in grids/thumbnails). The full gate flow is in
  // GatedMedia, used by the post card.
  const gated = typeof refUri === "string" && refUri.startsWith("gate:");

  useEffect(() => {
    if (gated) return; // gate refs aren't plain-resolvable
    let active = true;
    setState("loading");
    setUrl(null);
    resolveMediaUrl(refUri)
      .then((u) => {
        if (!active) return;
        if (u) setUrl(u);
        else setState("error");
      })
      .catch(() => active && setState("error"));
    return () => {
      active = false;
    };
  }, [refUri]);

  if (gated) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-ink-soft text-ink-muted",
          rounded && "rounded-2xl",
          className,
        )}
      >
        <Lock className="h-5 w-5" />
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-ink-soft text-ink-muted",
          rounded && "rounded-2xl",
          className,
        )}
      >
        <div className="flex flex-col items-center gap-1.5 p-4 text-center text-xs">
          <ImageOff className="h-6 w-6" />
          <span>{t("feed.imageUnavailable")}</span>
        </div>
      </div>
    );
  }

  // While the ref is resolving, show a skeleton placeholder.
  if (!url) {
    return <div className={cn("skeleton", rounded && "rounded-2xl", className)} />;
  }

  // Render the <img> VISIBLE (not display:none). A `display:none` +
  // `loading="lazy"` image never loads in Chrome, so onLoad never fires and it
  // stays hidden forever — which made every photo render black. The browser
  // shows the image progressively as it downloads; onError falls back gracefully.
  return (
    <img
      src={url}
      alt={alt ?? ""}
      loading="lazy"
      onError={() => setState("error")}
      className={cn("block", rounded && "rounded-2xl", className)}
      style={style}
    />
  );
}
