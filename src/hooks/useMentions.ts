import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useAuth } from "@/store/auth";
import { reverseUsername } from "@/lib/username";
import { getMentions, type Mention } from "@/lib/mentions";

const READ_KEY = "rougee:mentions-read";
const getRead = (): number => {
  try {
    return Number(localStorage.getItem(READ_KEY)) || 0;
  } catch {
    return 0;
  }
};

/** The signed-in user's @handle (null if they haven't claimed one). */
export function useMyHandle() {
  const { publicKey } = useAuth();
  return useQuery({
    queryKey: ["myHandle", publicKey],
    enabled: Boolean(publicKey),
    queryFn: () => reverseUsername(publicKey),
    staleTime: 5 * 60_000,
  });
}

/**
 * Posts that mention the viewer, plus an unread count (anything newer than the
 * last time Activity was opened). `markRead` clears the badge.
 */
export function useMentions() {
  const { data: handle } = useMyHandle();
  const q = useQuery({
    queryKey: ["mentions", handle],
    enabled: Boolean(handle),
    queryFn: () => getMentions(handle as string),
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  const [lastRead, setLastRead] = useState(getRead);
  const items: Mention[] = q.data ?? [];
  const unread = items.filter((m) => m.at > lastRead).length;

  const markRead = useCallback(() => {
    const top = items[0]?.at ?? 0;
    if (top > lastRead) {
      try {
        localStorage.setItem(READ_KEY, String(top));
      } catch {
        /* ignore quota */
      }
      setLastRead(top);
    }
  }, [items, lastRead]);

  return { items, unread, markRead, handle: handle ?? null };
}
