import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { Event } from "nostr-tools";
import { getActed, subscribeActed, replyTargetOf } from "@/lib/nostrAuth";
import { getNostrSocial, subscribeNostrSocial } from "@/lib/nostrSocial";
import { getNotificationsState, subscribeNotifications } from "@/lib/nostrNotifications";
import {
  NOSTR_RELAYS,
  NOSTR_ID_PREFIX,
  getPool,
  isFeedNote,
  isMachineNote,
  imagesOf,
  videosOf,
  eventToFeedPost,
  parseProfile,
  hashtagsOf,
  toMs,
  type FeedPost,
  type NostrProfile,
} from "@/lib/nostrFeed";
import { useGlobalTimeline } from "./useSocial";
import { useSavedIds } from "./useSaved";
import { useAuth } from "@/store/auth";
import { decodeBody } from "@/lib/envelope";
import { getTasteProfile, tagsFromText } from "@/lib/taste";

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
  const [reactions, setReactions] = useState<Map<string, Set<string>>>(new Map());
  const [reposts, setReposts] = useState<Map<string, Set<string>>>(new Map());
  const [replies, setReplies] = useState<Map<string, Set<string>>>(new Map());
  const wantProfiles = useRef<Set<string>>(new Set());

  // ── Live subscription ──
  useEffect(() => {
    if (!enabled) return;
    setEvents(new Map());
    setPending(new Map());
    setReactions(new Map());
    setReposts(new Map());
    setReplies(new Map());
    const pool = getPool();
    // Posts that already existed when the feed opened are backlog → shown
    // immediately; only notes published *after* are held as "new". This keeps
    // the initial load fully populated regardless of multi-relay EOSE timing.
    const openedAt = Math.floor(Date.now() / 1000);
    let buffer: Event[] = [];
    let primed = false; // paint the first batch quickly, then settle into batching
    let caughtUp = false; // after the initial load, ALL new arrivals are held (the pill)
    let eosed = false;

    const flushBuffer = () => {
      if (!buffer.length) return;
      const batch = buffer;
      buffer = [];
      if (caughtUp) {
        // Initial load is done — everything new waits behind the pill, even a
        // late-propagating note whose created_at predates when the feed opened.
        setPending((prev) => capNewest(addAll(prev, batch)));
        return;
      }
      const backlog = batch.filter((e) => e.created_at <= openedAt);
      const fresh = batch.filter((e) => e.created_at > openedAt);
      if (backlog.length) setEvents((prev) => capNewest(addAll(prev, backlog)));
      if (fresh.length) setPending((prev) => capNewest(addAll(prev, fresh)));
    };
    const timer = setInterval(flushBuffer, FLUSH_MS);
    // Fallback: if no relay ever EOSEs, still stop showing new posts after a bit.
    const catchUpFallback = setTimeout(() => {
      flushBuffer();
      caughtUp = true;
    }, 8000);

    const filter = topic
      ? { kinds: [1], "#t": [topic], limit: 200 }
      : { kinds: [1], limit: 200 };
    const sub = pool.subscribeMany(NOSTR_RELAYS, filter, {
      onevent: (e) => {
        if (!isFeedNote(e)) return;
        buffer.push(e);
        wantProfiles.current.add(e.pubkey);
        if (!primed) {
          primed = true;
          setTimeout(flushBuffer, 120);
        }
      },
      oneose: () => {
        flushBuffer();
        if (eosed) return;
        eosed = true;
        // Grace window to absorb stragglers from slower relays, then hold.
        setTimeout(() => {
          flushBuffer();
          caughtUp = true;
        }, 2500);
      },
    });

    return () => {
      clearInterval(timer);
      clearTimeout(catchUpFallback);
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

  // ── Live interaction counts: replies (1), reposts (6), reactions (7) ──
  const idsKey = useMemo(
    () => [...events.keys()].slice(0, 100).sort().join(","),
    [events],
  );
  const [stableIds, setStableIds] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setStableIds(idsKey), 1200);
    return () => clearTimeout(t);
  }, [idsKey]);

  useEffect(() => {
    if (!enabled || !stableIds) return;
    const ids = stableIds.split(",").filter(Boolean);
    const idSet = new Set(ids);
    const addTo = (
      setter: (u: (prev: Map<string, Set<string>>) => Map<string, Set<string>>) => void,
      noteId: string,
      val: string,
    ) =>
      setter((prev) => {
        if (prev.get(noteId)?.has(val)) return prev;
        const next = new Map(prev);
        next.set(noteId, new Set(prev.get(noteId)).add(val));
        return next;
      });
    const sub = getPool().subscribeMany(
      NOSTR_RELAYS,
      { kinds: [1, 6, 7], "#e": ids },
      {
        onevent: (e) => {
          const es = e.tags.filter((t) => t[0] === "e" && t[1]).map((t) => t[1]);
          if (e.kind === 1) {
            const target = replyTargetOf(e);
            if (target && idSet.has(target)) addTo(setReplies, target, e.id);
          } else if (e.kind === 7) {
            if (e.content.trim() === "-") return; // NIP-25 downvote — not a like
            const target = [...es].reverse().find((id) => idSet.has(id));
            if (target) addTo(setReactions, target, e.pubkey);
          } else if (e.kind === 6) {
            const target = es.find((id) => idSet.has(id));
            if (target) addTo(setReposts, target, e.id);
          }
        },
      },
    );
    return () => sub.close();
  }, [enabled, stableIds]);

  const live = useMemo<FeedPost[]>(
    () =>
      [...events.values()]
        .sort((a, b) => b.created_at - a.created_at)
        .map((e) => {
          const fp = eventToFeedPost(e, profiles.get(e.pubkey));
          if (fp.nostr) {
            fp.nostr.likeCount = reactions.get(e.id)?.size ?? 0;
            fp.nostr.replyCount = replies.get(e.id)?.size ?? 0;
            fp.nostr.repostCount = reposts.get(e.id)?.size ?? 0;
          }
          return fp;
        }),
    [events, profiles, reactions, replies, reposts],
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
 * Recent top-level notes from the accounts the viewer follows on Nostr (their
 * kind-3 contact list), newest-first. Powers the Following tab so it spans both
 * networks — not just RougeChain follows. Includes text and media notes (both
 * render in NostrPostCard); excludes replies and machine/junk traffic. Empty
 * (and idle) when the viewer has no Nostr key or follows no one.
 */
export function useNostrFollowingFeed(enabled: boolean): {
  posts: FeedPost[];
  isLoading: boolean;
} {
  const { follows, mutes } = useNostrSocial();
  const authorsKey = useMemo(() => [...follows].sort().join(","), [follows]);
  const [events, setEvents] = useState<Map<string, Event>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [loading, setLoading] = useState(false);
  const wantProfiles = useRef<Set<string>>(new Set());

  useEffect(() => {
    const authors = authorsKey ? authorsKey.split(",") : [];
    if (!enabled || authors.length === 0) {
      setEvents(new Map());
      setLoading(false);
      return;
    }
    setEvents(new Map());
    setLoading(true);
    const pool = getPool();
    let buffer: Event[] = [];
    const flush = () => {
      if (!buffer.length) return;
      const batch = buffer;
      buffer = [];
      setEvents((prev) => capNewest(addAll(prev, batch)));
    };
    const timer = setInterval(flush, FLUSH_MS);
    // Stop the spinner even if no relay EOSEs (flaky relay / slow network).
    const stopLoading = setTimeout(() => setLoading(false), 8000);
    const sub = pool.subscribeMany(
      NOSTR_RELAYS,
      // Nostr REQ filters cap author lists; 500 covers any realistic follow count.
      { kinds: [1], authors: authors.slice(0, 500), limit: 300 },
      {
        onevent: (e) => {
          if (replyTargetOf(e)) return; // top-level posts only, not replies
          if (e.tags.some((t) => t[0] === "content-warning")) return;
          if (isMachineNote(e.content)) return;
          // Skip empty notes (no text and no media — nothing to render).
          if (!e.content.trim() && imagesOf(e).length === 0 && videosOf(e).length === 0) return;
          buffer.push(e);
          wantProfiles.current.add(e.pubkey);
        },
        oneose: () => {
          flush();
          setLoading(false);
        },
      },
    );
    return () => {
      clearInterval(timer);
      clearTimeout(stopLoading);
      sub.close();
    };
  }, [enabled, authorsKey]);

  // Author profiles (kind-0) for name + avatar, fetched for newly seen authors.
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(async () => {
      const want = [...wantProfiles.current].filter((pk) => !profiles.has(pk)).slice(0, 60);
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

  const posts = useMemo<FeedPost[]>(
    () =>
      [...events.values()]
        .filter((e) => !mutes.has(e.pubkey)) // respect the viewer's Nostr mute list
        .sort((a, b) => b.created_at - a.created_at)
        .map((e) => eventToFeedPost(e, profiles.get(e.pubkey))),
    [events, profiles, mutes],
  );

  return { posts, isLoading: loading };
}

/**
 * All posts for a hashtag, across BOTH networks: live Nostr notes queried from
 * relays by `#t` tag, merged with RougeChain posts (global timeline) carrying
 * the tag. Newest-first, deduped. Powers topic search and the /tag pages — e.g.
 * searching "anime" actually reaches Nostr, not just the recent rouge timeline.
 */
export function useHashtagFeed(
  tag: string | undefined,
  enabled = true,
): { posts: FeedPost[]; loading: boolean } {
  const global = useGlobalTimeline();
  const { mutes } = useNostrSocial();
  const slug = (tag || "").toLowerCase().replace(/^#/, "").trim();
  const [events, setEvents] = useState<Map<string, Event>>(new Map());
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  const [loading, setLoading] = useState(false);
  const wantProfiles = useRef<Set<string>>(new Set());

  // Stream matching notes in as relays answer (don't block on a full querySync),
  // so the first results paint in well under a second.
  useEffect(() => {
    if (!enabled || !slug) {
      setEvents(new Map());
      setLoading(false);
      return;
    }
    setEvents(new Map());
    setLoading(true);
    const pool = getPool();
    let buffer: Event[] = [];
    const flush = () => {
      if (!buffer.length) return;
      const batch = buffer;
      buffer = [];
      setEvents((prev) => {
        const next = new Map(prev);
        for (const e of batch) if (!next.has(e.id)) next.set(e.id, e);
        return next;
      });
    };
    const timer = setInterval(flush, 350);
    const stopLoading = setTimeout(() => setLoading(false), 6000);
    const sub = pool.subscribeMany(
      NOSTR_RELAYS,
      { kinds: [1], "#t": [slug], limit: 200 },
      {
        onevent: (e) => {
          if (replyTargetOf(e) || isMachineNote(e.content)) return;
          if (!e.content.trim() && imagesOf(e).length === 0 && videosOf(e).length === 0) return;
          // Drop hashtag-stuffing spam (SEO notes tag dozens of topics at once).
          if (hashtagsOf(e).length > 15) return;
          buffer.push(e);
          wantProfiles.current.add(e.pubkey);
        },
        oneose: () => {
          flush();
          setLoading(false);
        },
      },
    );
    return () => {
      clearInterval(timer);
      clearTimeout(stopLoading);
      sub.close();
    };
  }, [slug, enabled]);

  // Fill author names/avatars in the background — posts render immediately with
  // a short-pubkey fallback and upgrade as profiles arrive.
  useEffect(() => {
    if (!enabled || !slug) return;
    const id = setInterval(async () => {
      const want = [...wantProfiles.current].filter((pk) => !profiles.has(pk)).slice(0, 60);
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
        /* relays flaky; retry next tick */
      }
    }, 800);
    return () => clearInterval(id);
  }, [enabled, slug, profiles]);

  const posts = useMemo<FeedPost[]>(() => {
    if (!slug) return [];
    const nostr = [...events.values()]
      .filter((e) => !mutes.has(e.pubkey)) // respect blocked (muted) authors
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 100)
      .map((e) => eventToFeedPost(e, profiles.get(e.pubkey)));
    const rouge = ((global.data ?? []) as FeedPost[]).filter(
      (p) => !p.nostr && postHashtags(p).includes(slug),
    );
    const byId = new Set<string>();
    const out: FeedPost[] = [];
    for (const p of [...rouge, ...nostr]) {
      if (byId.has(p.id)) continue;
      byId.add(p.id);
      out.push(p);
    }
    out.sort((a, b) => toMs(b.created_at) - toMs(a.created_at));
    return out;
  }, [global.data, events, profiles, slug, mutes]);

  // Only "loading" while we have nothing to show yet — never block visible results.
  return { posts, loading: loading && posts.length === 0 };
}

/** What this device has liked/reposted on Nostr (reactive). */
export function useActed() {
  return useSyncExternalStore(subscribeActed, getActed, getActed);
}

/** The viewer's Nostr follows + mutes (reactive). */
export function useNostrSocial() {
  return useSyncExternalStore(subscribeNostrSocial, getNostrSocial, getNostrSocial);
}

/** Nostr notifications (likes/reposts/replies to the viewer) + unread count. */
export function useNostrNotifications() {
  return useSyncExternalStore(subscribeNotifications, getNotificationsState, getNotificationsState);
}

/** Saved (bookmarked) Nostr posts, fetched by id from relays, in saved order. */
export function useSavedNostrPosts(): FeedPost[] {
  const savedIds = useSavedIds();
  const eventIds = useMemo(
    () =>
      savedIds
        .filter((id) => id.startsWith(NOSTR_ID_PREFIX))
        .map((id) => id.slice(NOSTR_ID_PREFIX.length)),
    [savedIds],
  );
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const key = eventIds.join(",");
  useEffect(() => {
    if (!eventIds.length) {
      setPosts([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const pool = getPool();
        const evs = await pool.querySync(NOSTR_RELAYS, { ids: eventIds }, { maxWait: 4000 });
        const authors = [...new Set(evs.map((e) => e.pubkey))];
        const metas = authors.length
          ? await pool.querySync(NOSTR_RELAYS, { kinds: [0], authors }, { maxWait: 4000 })
          : [];
        const profs = new Map<string, NostrProfile>();
        for (const m of metas) {
          if (profs.has(m.pubkey)) continue;
          const p = parseProfile(m.content);
          if (p) profs.set(m.pubkey, p);
        }
        if (cancelled) return;
        const byId = new Map(evs.map((e) => [e.id, e]));
        setPosts(
          eventIds
            .map((id) => byId.get(id))
            .filter((e): e is Event => Boolean(e))
            .map((e) => eventToFeedPost(e, profs.get(e.pubkey))),
        );
      } catch {
        /* relays flaky */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return posts;
}

/** Live replies to one note (kind-1 with #e), fetched only while `open`. */
export function useNoteThread(eventId: string, open: boolean) {
  const [replies, setReplies] = useState<Event[]>([]);
  const [profiles, setProfiles] = useState<Map<string, NostrProfile>>(new Map());
  useEffect(() => {
    if (!open || !eventId) {
      setReplies([]);
      setProfiles(new Map());
      return;
    }
    const seen = new Map<string, Event>();
    const wantAuthors = new Set<string>();
    const sub = getPool().subscribeMany(
      NOSTR_RELAYS,
      { kinds: [1], "#e": [eventId] },
      {
        onevent: (e) => {
          if (replyTargetOf(e) !== eventId || seen.has(e.id)) return;
          seen.set(e.id, e);
          wantAuthors.add(e.pubkey);
          setReplies([...seen.values()].sort((a, b) => a.created_at - b.created_at));
        },
      },
    );
    // resolve reply-author profiles (name + avatar)
    const pid = setInterval(async () => {
      const want = [...wantAuthors].slice(0, 40);
      if (!want.length) return;
      want.forEach((pk) => wantAuthors.delete(pk));
      try {
        const metas = await getPool().querySync(NOSTR_RELAYS, { kinds: [0], authors: want }, { maxWait: 4000 });
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
        /* relays flaky */
      }
    }, 1200);
    return () => {
      sub.close();
      clearInterval(pid);
    };
  }, [eventId, open]);
  return { replies, profiles };
}

/** One Nostr author's recent notes + their kind-0 profile (for their rougee profile page). */
export function useNostrAuthor(pubkey: string | undefined) {
  const [notes, setNotes] = useState<Event[]>([]);
  const [profile, setProfile] = useState<NostrProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pubkey) return;
    setNotes([]);
    setProfile(null);
    setLoading(true);
    const pool = getPool();
    const seen = new Map<string, Event>();
    const sub = pool.subscribeMany(
      NOSTR_RELAYS,
      { kinds: [1], authors: [pubkey], limit: 60 },
      {
        onevent: (e) => {
          if (e.tags.some((t) => t[0] === "e") || seen.has(e.id)) return; // top-level only
          seen.set(e.id, e);
          setNotes([...seen.values()].sort((a, b) => b.created_at - a.created_at));
        },
        oneose: () => setLoading(false),
      },
    );
    (async () => {
      try {
        const metas = await pool.querySync(NOSTR_RELAYS, { kinds: [0], authors: [pubkey] }, { maxWait: 4000 });
        const newest = metas.sort((a, b) => b.created_at - a.created_at)[0];
        if (newest) setProfile(parseProfile(newest.content));
      } catch {
        /* profile optional */
      }
    })();
    return () => sub.close();
  }, [pubkey]);

  const feedPosts = useMemo<FeedPost[]>(
    () => notes.map((e) => eventToFeedPost(e, profile ?? undefined)),
    [notes, profile],
  );

  return { notes: feedPosts, profile, loading };
}

/**
 * Discover = native RougeChain global timeline + a live stream of Nostr image
 * notes, interleaved newest-first. `newCount`/`showNew` drive the "N new" pill.
 */
// Discover ranking — a blend of recency and engagement, nudged toward people
// you follow. Tune the weights here.
const RANK = {
  repostWeight: 2,
  replyWeight: 1.5,
  decayExponent: 1.3, // higher ⇒ recency dominates more
  followBoost: 2.5,
  personalWeight: 1.8, // how hard the device-local taste profile nudges matches
  diversityWindow: 3, // no more than one post per author within this window
};

/** Hashtags on a feed post (nostr note text, or a rouge post's caption). */
function postHashtags(p: FeedPost): string[] {
  if (p.nostr) return tagsFromText(p.body);
  const d = decodeBody(p.body);
  const cap = d.kind === "text" ? d.text : ((d as { data?: { cap?: string } }).data?.cap ?? "");
  return tagsFromText(cap);
}

export function useDiscoverFeed(topic: string | null = null) {
  const global = useGlobalTimeline();
  const stream = useNostrStream(true, topic);
  const { follows, mutes } = useNostrSocial();
  const { publicKey } = useAuth();
  // Freeze the ranked order so the feed doesn't reshuffle as counts trickle in;
  // it only re-ranks when the set of posts changes (new posts / refresh).
  const orderRef = useRef<{ sig: string; ids: string[] }>({ sig: "", ids: [] });

  const data = useMemo<FeedPost[]>(() => {
    const rouge = (global.data ?? []) as FeedPost[];
    const all = [...rouge, ...stream.live].filter(
      (p) => !p.nostr || !mutes.has(p.nostr.pubkey), // hide blocked authors
    );
    const byId = new Map(all.map((p) => [p.id, p]));
    const sig = [...byId.keys()].sort().join(",");

    if (orderRef.current.sig !== sig) {
      const now = Date.now();
      // Personalized nudge from the viewer's device-local taste profile (the
      // authors + hashtags they engage with). Empty on cold-start → no effect.
      const taste = getTasteProfile(publicKey);
      const score = (p: FeedPost): number => {
        const ageH = Math.max(0, (now - toMs(p.created_at)) / 3_600_000);
        const n = p.nostr;
        const eng = n
          ? (n.likeCount ?? 0) +
            RANK.repostWeight * (n.repostCount ?? 0) +
            RANK.replyWeight * (n.replyCount ?? 0)
          : 0;
        // +1 keeps brand-new, zero-engagement posts competitive (the "recency" half)
        let s = (eng + 1) / Math.pow(ageH + 2, RANK.decayExponent);
        if (n && follows.has(n.pubkey)) s *= RANK.followBoost;
        if (taste.hasData) {
          const authorAff = taste.authors[p.author_pubkey] ?? 0;
          let tagAff = 0;
          for (const tg of postHashtags(p)) tagAff = Math.max(tagAff, taste.tags[tg] ?? 0);
          const aff = authorAff + 0.5 * tagAff; // author affinity weighs more than tag
          s *= 1 + RANK.personalWeight * aff;
        }
        return s;
      };

      // Sort by score, then interleave so one author can't dominate a run.
      const scored = all.map((p) => ({ p, s: score(p) })).sort((a, b) => b.s - a.s);
      const recent: string[] = [];
      const ids: string[] = [];
      while (scored.length) {
        let idx = scored.findIndex((x) => !recent.includes(x.p.author_pubkey));
        if (idx === -1) idx = 0; // everyone's recent — just take the top
        const [picked] = scored.splice(idx, 1);
        ids.push(picked.p.id);
        recent.push(picked.p.author_pubkey);
        if (recent.length > RANK.diversityWindow) recent.shift();
      }
      orderRef.current = { sig, ids };
    }
    // Return in the frozen order, carrying the latest post objects (live counts).
    return orderRef.current.ids
      .map((id) => byId.get(id))
      .filter((p): p is FeedPost => Boolean(p));
  }, [global.data, stream.live, follows, mutes, publicKey]);

  return {
    data,
    isLoading: global.isLoading,
    isError: global.isError,
    newCount: stream.pending,
    showNew: stream.flush,
    trending: stream.trending,
  };
}
