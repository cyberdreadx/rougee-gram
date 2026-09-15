import { useRef, useState } from "react";
import type { CarouselItem } from "@/lib/envelope";
import MediaImage from "./MediaImage";
import { cn } from "@/lib/utils";

export default function Carousel({ items }: { items: CarouselItem[] }) {
  const [idx, setIdx] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);

  function onScroll() {
    const el = ref.current;
    if (!el || el.clientWidth === 0) return;
    setIdx(Math.round(el.scrollLeft / el.clientWidth));
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={ref}
        onScroll={onScroll}
        className="hide-scrollbar flex h-full w-full snap-x snap-mandatory overflow-x-auto"
      >
        {items.map((it, i) => (
          <div key={i} className="h-full w-full flex-shrink-0 snap-center">
            <MediaImage refUri={it.cid} alt="" className="h-full w-full object-cover" />
          </div>
        ))}
      </div>

      {items.length > 1 && (
        <>
          <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white backdrop-blur">
            {idx + 1}/{items.length}
          </span>
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {items.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors",
                  i === idx ? "bg-white" : "bg-white/40",
                )}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
