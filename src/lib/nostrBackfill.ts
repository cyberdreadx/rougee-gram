import type { SocialPost } from "@rougechain/sdk";
import type { Event } from "nostr-tools";
import { rc } from "@/lib/rouge";
import { decodeBody, isAdPost } from "@/lib/envelope";
import { resolveMediaUrl } from "@/lib/media";
import { NOSTR_RELAYS, getPool } from "@/lib/nostrFeed";
import { getSigner } from "@/lib/nostrAuth";
import { mirrorPostToNostr, rougeePostUrl, rougeePostIdFromEvent } from "@/lib/nostrMirror";

/**
 * Share past posts to Nostr: posts made before mirroring existed (or while it
 * was off) get a Nostr copy dated to the original post, so they fill in the
 * history without showing up as new. Copies an early mirror made without the
 * back-link (r tag) are replaced, so Nostr likes on them count in Rougee.
 */
export interface BackfillPlan {
  /** Posts with no Nostr copy yet. */
  missing: SocialPost[];
  /** Posts whose Nostr copy lacks the back-link: old note ids to replace. */
  relink: { post: SocialPost; oldNoteIds: string[] }[];
}

const SHAREABLE = new Set(["photo", "video", "carousel", "text"]);

function isShareable(p: SocialPost): boolean {
  if (p.reply_to_id || isAdPost(p)) return false;
  const d = decodeBody(p.body);
  if (!SHAREABLE.has(d.kind)) return false;
  if (d.kind !== "text" && (d.data as { g?: unknown }).g) return false; // gated
  return true;
}

/** Text a copy of this post would contain (media URL or caption/text). */
async function fingerprint(p: SocialPost): Promise<string[]> {
  const d = decodeBody(p.body);
  const out: string[] = [];
  if (d.kind === "text" && d.text.trim().length >= 12) out.push(d.text.trim().slice(0, 80));
  if (d.kind === "photo" || d.kind === "video" || d.kind === "carousel") {
    const cap = (d.data as { cap?: string }).cap?.trim();
    if (cap && cap.length >= 12) out.push(cap.slice(0, 80));
    const ref = d.kind === "carousel" ? d.data.items[0]?.cid : (d.data as { cid?: string }).cid;
    const url = ref ? await resolveMediaUrl(ref).catch(() => null) : null;
    if (url) out.push(url);
  }
  return out;
}

export async function planBackfill(
  owner: string,
  rougePubkey: string,
  /** Override the Nostr key to check (defaults to this account's signer). */
  nostrPubkey?: string,
): Promise<BackfillPlan> {
  // All of this account's posts (up to 300).
  const posts: SocialPost[] = [];
  for (let offset = 0; offset < 300; offset += 50) {
    const page = ((await rc().social.getUserPosts(rougePubkey, 50, offset))?.posts ??
      []) as SocialPost[];
    posts.push(...page);
    if (page.length < 50) break;
  }
  const shareable = posts.filter(isShareable);
  if (!shareable.length) return { missing: [], relink: [] };

  const me = nostrPubkey ?? (await getSigner(owner)).pubkey;
  const pool = getPool();
  // This key's notes: linked copies (by r tag) and everything else recent.
  const urls = shareable.map((p) => rougeePostUrl(p.id));
  const linked: Event[] = [];
  for (let i = 0; i < urls.length; i += 100) {
    linked.push(
      ...(await pool.querySync(
        NOSTR_RELAYS,
        { kinds: [1], authors: [me], "#r": urls.slice(i, i + 100) },
        { maxWait: 5000 },
      )),
    );
  }
  const mirrored = new Set(linked.map(rougeePostIdFromEvent).filter(Boolean) as string[]);
  const unlinked = (
    await pool.querySync(NOSTR_RELAYS, { kinds: [1], authors: [me], limit: 500 }, { maxWait: 5000 })
  ).filter((n) => !rougeePostIdFromEvent(n));

  const plan: BackfillPlan = { missing: [], relink: [] };
  for (const p of shareable) {
    if (mirrored.has(p.id)) continue;
    const fp = await fingerprint(p);
    const old = fp.length
      ? unlinked.filter((n) => fp.some((bit) => n.content.includes(bit))).map((n) => n.id)
      : [];
    if (old.length) plan.relink.push({ post: p, oldNoteIds: [...new Set(old)] });
    else plan.missing.push(p);
  }
  return plan;
}

/** Share the planned posts, oldest first. Returns how many succeeded. */
export async function runBackfill(
  owner: string,
  plan: BackfillPlan,
  meta: { name?: string; picture?: string },
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const signer = await getSigner(owner);
  const pool = getPool();
  const jobs = [
    ...plan.relink.map((r) => ({ post: r.post, old: r.oldNoteIds })),
    ...plan.missing.map((post) => ({ post, old: [] as string[] })),
  ].sort((a, b) => new Date(a.post.created_at).getTime() - new Date(b.post.created_at).getTime());

  let ok = 0;
  for (let i = 0; i < jobs.length; i++) {
    const { post, old } = jobs[i];
    try {
      if (old.length) {
        // NIP-09: retire the copy that lacks the back-link before replacing it.
        const del = await signer.sign({
          kind: 5,
          created_at: Math.floor(Date.now() / 1000),
          content: "Replaced with a linked copy",
          tags: [...old.map((id) => ["e", id]), ["k", "1"]],
        });
        await Promise.allSettled(pool.publish(NOSTR_RELAYS, del));
      }
      const createdAt = Math.floor(new Date(post.created_at).getTime() / 1000);
      if (await mirrorPostToNostr(owner, post.body, meta, post.id, createdAt)) ok++;
    } catch {
      /* skip this one, keep going */
    }
    onProgress(i + 1, jobs.length);
    await new Promise((r) => setTimeout(r, 400)); // be gentle with relays
  }
  return ok;
}
