import { useParams, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { resolveUsername, normalizeUsername } from "@/lib/username";
import { pubkeyToAddress } from "@rougechain/sdk";

/**
 * Root deep-link for @usernames (e.g. rougee.app/@alex). React Router ranks the
 * app's static routes above this trailing `:handle` param, so only otherwise-
 * unmatched single-segment paths land here. A leading "@" means treat it as a
 * username: resolve it on-chain and forward to the owner's profile; anything
 * else falls through to home (unchanged from the old catch-all).
 */
export default function HandleRoute() {
  const { handle } = useParams<{ handle: string }>();
  const isHandle = !!handle && handle.startsWith("@");
  const name = isHandle ? normalizeUsername(handle) : "";

  const { data, isLoading } = useQuery({
    queryKey: ["resolveUsername", name],
    enabled: isHandle,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await resolveUsername(name);
      if (!r) return { address: null as string | null, pubkey: "" };
      return { address: await pubkeyToAddress(r.pubkey), pubkey: r.pubkey };
    },
  });

  if (!isHandle) return <Navigate to="/" replace />;
  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
      </div>
    );
  }
  if (!data?.address) {
    return (
      <div className="py-20 text-center text-sm text-ink-muted">
        No one owns <span className="font-mono">@{name}</span> yet.
      </div>
    );
  }
  return <Navigate to={`/u/${data.address}`} replace state={{ pubkey: data.pubkey }} />;
}
