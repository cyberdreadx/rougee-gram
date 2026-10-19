/**
 * Mirror a just-published rougee-gram post out to Nostr as a kind-1 note, so a
 * creator's content flows to the wider Nostr network too. On by default (see
 * the composer toggle), best-effort, signed with the viewer's Nostr key. Media
 * is referenced by its public IPFS-gateway URL (local-only refs are skipped).
 */
import { decodeBody } from "./envelope";
import { resolveMediaUrl } from "./media";
import { getSigner, ensureNostrProfile, publishNostrProfile } from "./nostrAuth";
import { NOSTR_RELAYS, getPool } from "./nostrFeed";

const httpsOnly = (u: string | null): string | null => (u && /^https:\/\//i.test(u) ? u : null);

/** Canonical rougee URL for a post — embedded in mirrors so a Nostr like can
 *  route back to the original RougeChain post (and clients show a link home). */
export const rougeePostUrl = (id: string): string => `https://rougee.app/p/${id}`;
const ROUGEE_POST_RE = /rougee\.app\/p\/([A-Za-z0-9_-]+)/i;

/** Extract the original RougeChain post id from a mirrored note's `r` tag. */
export function rougeePostIdFromEvent(ev: { tags: string[][] }): string | undefined {
  for (const tg of ev.tags) {
    if (tg[0] === "r" && tg[1]) {
      const m = tg[1].match(ROUGEE_POST_RE);
      if (m) return m[1];
    }
  }
  return undefined;
}

/**
 * Sync a rougee profile to the local key's Nostr kind-0 (name → name, bio →
 * about, avatar → picture, cover → banner), so edits — cover included — show
 * across Nostr clients. Best-effort; no-op for extension keys. Images must be on
 * a public backend (cf/ipfs → https); local-only refs are dropped.
 */
export async function mirrorProfileToNostr(
  owner: string,
  p: { name?: string; bio?: string; avatarRef?: string; bannerRef?: string },
): Promise<void> {
  let signer;
  try {
    signer = await getSigner(owner);
  } catch {
    return;
  }
  if (signer.viaExtension) return;
  const picture = httpsOnly(p.avatarRef ? await resolveMediaUrl(p.avatarRef).catch(() => null) : null);
  const banner = httpsOnly(p.bannerRef ? await resolveMediaUrl(p.bannerRef).catch(() => null) : null);
  await publishNostrProfile(signer, {
    name: p.name || "rougee user",
    about: p.bio || "on rougee.app",
    picture: picture ?? undefined,
    banner: banner ?? undefined,
    website: "https://rougee.app",
  }).catch(() => {});
}

const PREF_KEY = "rougee:mirror-nostr";
// Default ON: new posts reach Nostr unless the creator explicitly turns it off
// (a stored "0"). Only an explicit opt-out disables it.
export const getMirrorPref = (): boolean => {
  try {
    return localStorage.getItem(PREF_KEY) !== "0";
  } catch {
    return true;
  }
};
export const setMirrorPref = (on: boolean): void => {
  try {
    localStorage.setItem(PREF_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
};

export async function mirrorPostToNostr(
  owner: string,
  body: string,
  meta: { name?: string; picture?: string },
  postId?: string,
): Promise<void> {
  const d = decodeBody(body);
  let text = "";
  const refs: string[] = [];
  if (d.kind === "text") text = d.text;
  else if (d.kind === "photo") {
    if (d.data.g) return; // never leak gated (subscribers-only) content to Nostr
    text = d.data.cap ?? "";
    refs.push(d.data.cid);
  } else if (d.kind === "video") {
    if (d.data.g) return;
    text = d.data.cap ?? "";
    refs.push(d.data.cid);
    // Include the poster too — HLS (.m3u8) won't play in a Nostr client, so a
    // viewable thumbnail keeps the note from looking empty.
    if (d.data.poster) refs.push(d.data.poster);
  } else if (d.kind === "carousel") {
    if (d.data.g) return;
    text = d.data.cap ?? "";
    for (const it of d.data.items) refs.push(it.cid);
  } else {
    return; // skip story / profile / note / repost / highlight
  }

  // Only public (https, i.e. IPFS-gateway) urls work on Nostr; drop local refs.
  const urls = (
    await Promise.all(refs.map((r) => resolveMediaUrl(r).catch(() => null)))
  ).filter((u): u is string => !!u && /^https:\/\//i.test(u));

  const content = [text.trim(), ...urls].filter(Boolean).join("\n");
  if (!content) return;

  const signer = await getSigner(owner);
  await ensureNostrProfile(signer, meta).catch(() => {});
  const ev = await signer.sign({
    kind: 1,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["t", "rougee"],
      // Back-reference to the original post so a Nostr like can deep-link home.
      ...(postId ? [["r", rougeePostUrl(postId)]] : []),
      ...urls.map((u) => ["imeta", `url ${u}`]),
    ],
    content,
  });
  await Promise.allSettled(getPool().publish(NOSTR_RELAYS, ev));
}
