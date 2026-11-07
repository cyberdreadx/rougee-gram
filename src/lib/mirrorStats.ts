import { useQuery } from "@tanstack/react-query";
import { NOSTR_RELAYS, getPool } from "@/lib/nostrFeed";
import { rougeePostUrl, rougeePostIdFromEvent } from "@/lib/nostrMirror";
import { resolveNostrPubkey } from "@/lib/nostrLink";
import { getSigner } from "@/lib/nostrAuth";
import type { EventTemplate } from "nostr-tools";

/** Marks a Nostr like that Rougee sent alongside a RougeChain like. It's
 *  already in RougeChain's count, so counts skip it; the likes list still
 *  shows the person's name. */
export const ROUGEE_LIKE_TAG = ["client", "rougee"];
const isRougeeLike = (tags: string[][]) =>
  tags.some((t) => t[0] === ROUGEE_LIKE_TAG[0] && t[1] === ROUGEE_LIKE_TAG[1]);

/**
 * Likes / reposts a RougeChain post got on its Nostr copy. Rougee mirrors
 * posts to Nostr with an `r` tag pointing back (rougee.app/p/<id>); people on
 * Nostr react to that copy, which RougeChain's own counts never see.
 *
 * Requests from all cards on screen are batched (~300 ms) into two relay
 * queries. Only notes by the author's linked Nostr key count, so someone else
 * tagging a note with the same `r` link can't inflate a post.
 */
export interface MirrorStats {
  /** Likes made on Nostr itself (not already counted on RougeChain). */
  likes: number;
  reposts: number;
  /** Nostr pubkeys of the people who liked / reposted the Nostr copy. */
  likers: string[];
  reposters: string[];
}

type Req = { postId: string; author: string; resolve: (s: MirrorStats) => void };
let queue: Req[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const batch = queue;
  queue = [];
  run(batch).catch(() =>
    batch.forEach((r) => r.resolve({ likes: 0, reposts: 0, likers: [], reposters: [] })),
  );
}

async function run(batch: Req[]) {
  const empty: MirrorStats = { likes: 0, reposts: 0, likers: [], reposters: [] };
  // Linked Nostr key per author (cached after the first lookup).
  const authors = [...new Set(batch.map((r) => r.author))];
  const keys = new Map<string, string | null>();
  await Promise.all(
    authors.map(async (a) => keys.set(a, await resolveNostrPubkey(a).catch(() => null))),
  );
  const wanted = batch.filter((r) => keys.get(r.author));
  if (!wanted.length) return batch.forEach((r) => r.resolve(empty));

  const pool = getPool();
  const notes = await pool.querySync(
    NOSTR_RELAYS,
    {
      kinds: [1],
      authors: [...new Set(wanted.map((r) => keys.get(r.author)!))],
      "#r": wanted.map((r) => rougeePostUrl(r.postId)),
    },
    { maxWait: 4000 },
  );
  // Mirror note id(s) per post, authored by that post author's own key.
  const notesByPost = new Map<string, string[]>();
  const postByNote = new Map<string, string>();
  for (const n of notes) {
    const pid = rougeePostIdFromEvent(n);
    const req = pid && wanted.find((r) => r.postId === pid);
    if (!req || keys.get(req.author) !== n.pubkey) continue;
    notesByPost.set(pid, [...(notesByPost.get(pid) ?? []), n.id]);
    postByNote.set(n.id, pid);
  }
  if (!postByNote.size) return batch.forEach((r) => r.resolve(empty));

  const reacts = await pool.querySync(
    NOSTR_RELAYS,
    { kinds: [6, 7], "#e": [...postByNote.keys()] },
    { maxWait: 4000 },
  );
  const likers = new Map<string, Set<string>>();
  const counted = new Map<string, Set<string>>(); // Nostr-native likers only
  const reposters = new Map<string, Set<string>>();
  for (const e of reacts) {
    if (e.kind === 7 && e.content.trim() === "-") continue; // downvote
    const target = [...e.tags]
      .reverse()
      .find((t) => t[0] === "e" && postByNote.has(t[1]))?.[1];
    if (!target) continue;
    const pid = postByNote.get(target)!;
    const m = e.kind === 7 ? likers : reposters;
    if (!m.has(pid)) m.set(pid, new Set());
    m.get(pid)!.add(e.pubkey); // one per person
    if (e.kind === 7 && !isRougeeLike(e.tags)) {
      if (!counted.has(pid)) counted.set(pid, new Set());
      counted.get(pid)!.add(e.pubkey);
    }
  }
  for (const r of batch) {
    const l = [...(likers.get(r.postId) ?? [])];
    const rp = [...(reposters.get(r.postId) ?? [])];
    const c = counted.get(r.postId)?.size ?? 0;
    r.resolve({ likes: c, reposts: rp.length, likers: l, reposters: rp });
  }
}

export function fetchMirrorStats(postId: string, author: string): Promise<MirrorStats> {
  return new Promise((resolve) => {
    queue.push({ postId, author, resolve });
    if (!timer) timer = setTimeout(flush, 300);
  });
}

export function useMirrorStats(postId: string, author: string | undefined) {
  return useQuery({
    queryKey: ["mirrorStats", postId],
    enabled: Boolean(postId && author),
    staleTime: 2 * 60_000,
    queryFn: () => fetchMirrorStats(postId, author as string),
  });
}

/** The post's Nostr copy (by the author's linked key), or null. */
async function findMirrorNote(
  postId: string,
  author: string,
): Promise<{ id: string; pubkey: string } | null> {
  const key = await resolveNostrPubkey(author).catch(() => null);
  if (!key) return null;
  const notes = await getPool().querySync(
    NOSTR_RELAYS,
    { kinds: [1], authors: [key], "#r": [rougeePostUrl(postId)] },
    { maxWait: 4000 },
  );
  const n = notes.sort((a, b) => a.created_at - b.created_at)[0];
  return n ? { id: n.id, pubkey: n.pubkey } : null;
}

/**
 * Mirror a RougeChain like/unlike onto the post's Nostr copy, so the liker's
 * name shows in the likes list and the like reaches Nostr apps. Best-effort.
 */
export async function mirrorLike(
  owner: string,
  postId: string,
  author: string,
  liked: boolean,
): Promise<void> {
  const note = await findMirrorNote(postId, author);
  if (!note) return;
  const signer = await getSigner(owner);
  const pool = getPool();
  if (liked) {
    const tmpl: EventTemplate = {
      kind: 7,
      created_at: Math.floor(Date.now() / 1000),
      content: "+",
      tags: [
        ["e", note.id],
        ["p", note.pubkey],
        ["k", "1"],
        ["r", rougeePostUrl(postId)],
        ROUGEE_LIKE_TAG,
      ],
    };
    await Promise.allSettled(pool.publish(NOSTR_RELAYS, await signer.sign(tmpl)));
  } else {
    // NIP-09: ask relays to delete this account's likes on that note.
    const mine = await pool.querySync(
      NOSTR_RELAYS,
      { kinds: [7], authors: [signer.pubkey], "#e": [note.id] },
      { maxWait: 4000 },
    );
    if (!mine.length) return;
    const del: EventTemplate = {
      kind: 5,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags: [...mine.map((e) => ["e", e.id]), ["k", "7"]],
    };
    await Promise.allSettled(pool.publish(NOSTR_RELAYS, await signer.sign(del)));
  }
}
