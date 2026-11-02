import type { SocialPost } from "@rougechain/sdk";
import { rc } from "@/lib/rouge";
import { getProfile } from "@/lib/profile";
import { decodeBody } from "@/lib/envelope";
import { resolveMediaUrl } from "@/lib/media";
import { NOSTR_RELAYS, getPool } from "@/lib/nostrFeed";
import { rougeePostUrl } from "@/lib/nostrMirror";

/**
 * Find the Nostr pubkey behind a RougeChain account, so following someone in
 * Rougee can follow them on Nostr too.
 *
 * 1. The profile's `np` field (written on profile save, signed by their
 *    RougeChain key) — authoritative.
 * 2. Otherwise, their mirrored posts: Rougee tags each Nostr copy with
 *    `["r", "https://rougee.app/p/<id>"]`. Anyone could put that tag on a note,
 *    so a candidate only counts when its note also carries that post's media
 *    URL or caption — content only the real mirror would have.
 */
const cache = new Map<string, string | null>();
const CACHE_KEY = "rougee:nostr-links";
try {
  const saved = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") as Record<string, string>;
  for (const [k, v] of Object.entries(saved)) if (/^[0-9a-f]{64}$/.test(v)) cache.set(k, v);
} catch {
  /* unavailable */
}
function remember(rouge: string, nostr: string) {
  cache.set(rouge, nostr);
  try {
    const all: Record<string, string> = {};
    for (const [k, v] of cache) if (v) all[k] = v;
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export async function resolveNostrPubkey(rougePubkey: string): Promise<string | null> {
  if (!rougePubkey) return null;
  if (cache.has(rougePubkey)) return cache.get(rougePubkey) ?? null;

  const profile = await getProfile(rougePubkey).catch(() => null);
  if (profile?.nostrPubkey) {
    remember(rougePubkey, profile.nostrPubkey);
    return profile.nostrPubkey;
  }

  let posts: SocialPost[] = [];
  try {
    posts = ((await rc().social.getUserPosts(rougePubkey, 20, 0))?.posts ?? []) as SocialPost[];
  } catch {
    return null;
  }
  // What each mirrored note must contain: the post's media URL or caption.
  const proof = new Map<string, string[]>();
  for (const p of posts) {
    const d = decodeBody(p.body);
    const bits: string[] = [];
    if (d.kind === "text" && d.text.trim().length >= 12) bits.push(d.text.trim().slice(0, 80));
    if (d.kind === "photo" || d.kind === "video" || d.kind === "carousel") {
      const cap = (d.data as { cap?: string }).cap?.trim();
      if (cap && cap.length >= 12) bits.push(cap.slice(0, 80));
      const ref =
        d.kind === "carousel" ? d.data.items[0]?.cid : (d.data as { cid?: string }).cid;
      const url = ref ? await resolveMediaUrl(ref).catch(() => null) : null;
      if (url) bits.push(url);
    }
    if (bits.length) proof.set(rougeePostUrl(p.id), bits);
  }
  if (proof.size === 0) {
    cache.set(rougePubkey, null);
    return null;
  }

  let notes;
  try {
    notes = await getPool().querySync(
      NOSTR_RELAYS,
      { kinds: [1], "#r": [...proof.keys()], limit: 50 },
      { maxWait: 4000 },
    );
  } catch {
    return null;
  }
  const votes = new Map<string, number>();
  for (const n of notes) {
    const r = n.tags.find((t) => t[0] === "r" && proof.has(t[1]))?.[1];
    if (!r) continue;
    if (!proof.get(r)!.some((bit) => n.content.includes(bit))) continue;
    votes.set(n.pubkey, (votes.get(n.pubkey) ?? 0) + 1);
  }
  const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  if (best) remember(rougePubkey, best);
  else cache.set(rougePubkey, null); // retry next session
  return best;
}
