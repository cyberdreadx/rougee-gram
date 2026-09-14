import { useGlobalTimeline } from "@/hooks/useSocial";
import PhotoGrid from "@/components/PhotoGrid";

export default function Explore() {
  const { data, isLoading } = useGlobalTimeline();

  return (
    <div>
      <header className="sticky top-0 z-20 border-b border-ink-border bg-ink/80 px-4 py-3.5 backdrop-blur">
        <h1 className="text-base font-semibold">Explore</h1>
        <p className="text-xs text-ink-muted">
          Everything happening across RougeChain
        </p>
      </header>
      <div className="p-0.5 sm:p-1">
        <PhotoGrid posts={data} isLoading={isLoading} />
      </div>
    </div>
  );
}
