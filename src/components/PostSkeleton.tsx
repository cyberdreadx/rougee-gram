export default function PostSkeleton() {
  return (
    <div className="border-b border-ink-border/60 py-4">
      <div className="flex items-center gap-3 px-3 sm:px-0">
        <div className="skeleton h-9 w-9 rounded-full" />
        <div className="space-y-1.5">
          <div className="skeleton h-3 w-28 rounded" />
          <div className="skeleton h-2.5 w-20 rounded" />
        </div>
      </div>
      <div className="skeleton mt-3 aspect-square w-full sm:rounded-2xl" />
      <div className="mt-3 space-y-2 px-3 sm:px-0">
        <div className="skeleton h-4 w-24 rounded" />
        <div className="skeleton h-3 w-3/4 rounded" />
      </div>
    </div>
  );
}
