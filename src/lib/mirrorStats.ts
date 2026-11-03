import { useQuery } from "@tanstack/react-query";
import { NOSTR_RELAYS, getPool } from "@/lib/nostrFeed";
import { rougeePostUrl, rougeePostIdFromEvent } from "@/lib/nostrMirror";
import { resolveNostrPubkey } from "@/lib/nostrLink";

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
  likes: number;
  reposts: number;
}

type Req = { postId: string; author: string; resolve: (s: MirrorStats) => void };
let queue: Req[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  const batch = queue;
  queue = [];
  run(batch).catch(() => batch.forEach((r) => r.resolve({ likes: 0, reposts: 0 })));
}

async function run(batch: Req[]) {
  const empty = { likes: 0, reposts: 0 };
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
  }
  for (const r of batch) {
    r.resolve({
      likes: likers.get(r.postId)?.size ?? 0,
      reposts: reposters.get(r.postId)?.size ?? 0,
    });
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
