import { useSuggestedUsers } from "@/hooks/useSocial";
import UserRow from "./UserRow";
import { cn } from "@/lib/utils";

export default function WhoToFollow({
  limit = 5,
  className,
}: {
  limit?: number;
  className?: string;
}) {
  const { suggestions, isLoading } = useSuggestedUsers(limit);

  if (!isLoading && suggestions.length === 0) return null;

  return (
    <div className={cn("card p-4", className)}>
      <h3 className="mb-3 text-sm font-semibold">Who to follow</h3>
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3 w-24 rounded" />
                <div className="skeleton h-2.5 w-16 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3.5">
          {suggestions.map((pk) => (
            <UserRow key={pk} pubkey={pk} />
          ))}
        </div>
      )}
    </div>
  );
}
