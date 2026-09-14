import { useEffect, useState } from "react";
import { resolveMediaUrl } from "@/lib/media";
import { cn, colorFromString } from "@/lib/utils";

interface Props {
  /** Avatar media reference URI, or "" for the gradient fallback. */
  refUri?: string;
  /** Seed for the fallback color + initial (address or handle). */
  seed: string;
  name?: string;
  size?: number;
  className?: string;
  ring?: boolean;
}

export default function Avatar({
  refUri,
  seed,
  name,
  size = 40,
  className,
  ring,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (refUri) {
      resolveMediaUrl(refUri).then((u) => active && setUrl(u));
    } else {
      setUrl(null);
    }
    return () => {
      active = false;
    };
  }, [refUri]);

  const initial = (name || seed || "?").replace(/^rouge1/, "").charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-full",
        ring && "ring-2 ring-rouge-500 ring-offset-2 ring-offset-ink",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img
          src={url}
          alt={name ?? "avatar"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center font-semibold text-white"
          style={{
            background: `linear-gradient(135deg, ${colorFromString(seed)}, #8a0e34)`,
            fontSize: size * 0.42,
          }}
        >
          {initial}
        </div>
      )}
    </div>
  );
}
