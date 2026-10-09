import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Event } from "nostr-tools";
import {
  NOSTR_RELAYS,
  getPool,
  isFeedNote,
  eventToFeedPost,
  parseProfile,
  hashtagsOf,
  toMs,
  type FeedPost,
  type NostrProfile,
} from "@/lib/nostrFeed";
import { useGlobalTimeline } from "./useSocial";

const MAX_EVENTS = 300;
/** Apply incoming events in batches so a busy relay doesn't re-render per event. */
const FLUSH_MS = 700;

const addAll = (map: Map<string, Event>, events: Event[]): Map<string, Event> => {
  const next = new Map(map);
  for (const e of events) if (!next.has(e.id)) next.set(e.id, e);
  return next;
};

const capNewest = (map: Map<string, Event>): Map<string, Event> => {
  if (map.size <= MAX_EVENTS) return map;
  const keep = [...map.values()]
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, MAX_EVENTS);
  return new Map(keep.map((e) => [e.id, e]));
};

/**
 * Live Nostr image notes. New notes that arrive after the initial catch-up are
 * held in `pending` (so the list doesn't jump) and surfaced via a "N new" pill;
 * `flush()` pulls them into view.
 */
export function useNostrStream(enabled: boolean, topic: string | null = null) {
  const [events, setEvents] = useState<Map<string, Event>>(new Map());
  const [pending, setPending] = useState<Map<string, Event>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const wantProfiles = useRef<Set<string>>(new Set());

  // ── Live subscription ──
  useEffect(() => {
    if (!enabled) return;
    setEvents(new Map());
    setPending(new Map());
    const pool = getPool();
    let caughtUp = false;
    let buffer: Event[] = [];

    const flushBuffer = () => {
      if (!buffer.length) return;
      const batch = buffer;
      buffer = [];
      if (caughtUp) setPending((prev) => capNewest(addAll(prev, batch)));
      else setEvents((prev) => capNewest(addAll(prev, batch)));
    };
    const timer = setInterval(flushBuffer, FLUSH_MS);

    const filter = topic
      ? { kinds: [1], "#t": [topic], limit: 200 }
      : { kinds: [1], limit: 200 };
    const sub = pool.subscribeMany(NOSTR_RELAYS, filter, {
      onevent: (e) => {
        if (!isFeedNote(e)) return;
        buffer.push(e);
        wantProfiles.current.add(e.pubkey);
      },
      oneose: () => {
        flushBuffer();
        caughtUp = true;
      },
    });

    return () => {
      clearInterval(timer);
      sub.close();
    };
  }, [enabled, topic]);

  // ── Author profiles (kind-0), fetched for newly seen authors ──
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(async () => {
      const want = [...wantProfiles.current]
        .filter((pk) => !profiles.has(pk))
        .slice(0, 60);
      if (!want.length) return;
      want.forEach((pk) => wantProfiles.current.delete(pk));
      try {
        const metas = await getPool().querySync(
          NOSTR_RELAYS,
          { kinds: [0], authors: want },
          { maxWait: 4000 },
        );
        setProfiles((prev) => {
          const next = new Map(prev);
          for (const m of metas) {
            if (next.has(m.pubkey)) continue;
            const p = parseProfile(m.content);
            if (p) next.set(m.pubkey, p);
          }
          return next;
        });
      } catch {
        /* relays flaky; try again next tick */
      }
    }, 1500);
    return () => clearInterval(id);
  }, [enabled, profiles]);

  const live = useMemo<FeedPost[]>(
    () =>
      [...events.values()]
        .sort((a, b) => b.created_at - a.created_at)
        .map((e) => eventToFeedPost(e, profiles.get(e.pubkey))),
    [events, profiles],
  );

  const trending = useMemo<string[]>(() => {
    const counts = new Map<string, number>();
    for (const e of events.values())
      for (const tag of hashtagsOf(e)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    if (topic) counts.delete(topic);
    return [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [events, topic]);

  const flush = useCallback(() => {
    setPending((pend) => {
      setEvents((prev) => capNewest(addAll(prev, [...pend.values()])));
      return new Map();
    });
  }, []);

  return { live, pending: pending.size, flush, trending };
}

/**
 * Discover = native RougeChain global timeline + a live stream of Nostr image
 * notes, interleaved newest-first. `newCount`/`showNew` drive the "N new" pill.
 */
export function useDiscoverFeed(topic: string | null = null) {
  const global = useGlobalTimeline();
  const stream = useNostrStream(true, topic);

  const data = useMemo<FeedPost[]>(() => {
    const rouge = (global.data ?? []) as FeedPost[];
    return [...rouge, ...stream.live].sort(
      (a, b) => toMs(b.created_at) - toMs(a.created_at),
    );
  }, [global.data, stream.live]);

  return {
    data,
    isLoading: global.isLoading,
    isError: global.isError,
    newCount: stream.pending,
    showNew: stream.flush,
    trending: stream.trending,
  };
}
