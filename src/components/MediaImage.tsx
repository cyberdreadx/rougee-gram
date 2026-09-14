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

  return (
    <>
      {state === "loading" && (
        <div className={cn("skeleton", rounded && "rounded-2xl", className)} />
      )}
      {url && (
        <img
          src={url}
          alt={alt ?? ""}
          loading="lazy"
          onLoad={() => setState("ok")}
          onError={() => setState("error")}
          className={cn(
            state === "ok" ? "block" : "hidden",
            rounded && "rounded-2xl",
            className,
          )}
        />
      )}
    </>
  );
}
