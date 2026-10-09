import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchNostrFeed, toMs, type FeedPost } from "@/lib/nostrFeed";
import { useGlobalTimeline } from "./useSocial";

/** Recent Nostr image notes for the Discover feed. */
export function useNostrFeed() {
  return useQuery({
    queryKey: ["nostrFeed"],
    queryFn: () => fetchNostrFeed(40),
    staleTime: 60_000,
    retry: 1,
  });
}

/**
 * Discover = native RougeChain global timeline + recent Nostr image notes,
 * interleaved newest-first. Loading/error track the native feed; Nostr content
 * fills in as relays answer (its absence never blocks or breaks Discover).
 */
export function useDiscoverFeed(): {
  data: FeedPost[];
  isLoading: boolean;
  isError: boolean;
} {
  const global = useGlobalTimeline();
  const nostr = useNostrFeed();

  const data = useMemo<FeedPost[]>(() => {
    const rouge = (global.data ?? []) as FeedPost[];
    const notes = nostr.data ?? [];
    return [...rouge, ...notes].sort(
      (a, b) => toMs(b.created_at) - toMs(a.created_at),
    );
  }, [global.data, nostr.data]);

  return { data, isLoading: global.isLoading, isError: global.isError };
}
