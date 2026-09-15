import { useEffect, useState } from "react";
import { ImageOff } from "lucide-react";
import { resolveMediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

interface Props {
  refUri: string;
  alt?: string;
  className?: string;
  /** Rounded square placeholder while resolving. */
  rounded?: boolean;
}

/** Resolves a media reference (ipfs://… / local://…) and renders it with a
 *  loading skeleton and a graceful "unavailable" fallback. */
export default function MediaImage({ refUri, alt, className, rounded }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
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
          <span>Image unavailable</span>
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
    />
  );
}
