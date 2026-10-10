/**
 * Mirror a just-published rougee-gram post out to Nostr as a kind-1 note, so a
 * creator's content flows to the wider Nostr network too. Opt-in (see the
 * composer toggle), best-effort, signed with the viewer's Nostr key. Media is
 * referenced by its public IPFS-gateway URL (local-only refs are skipped).
 */
import { decodeBody } from "./envelope";
import { resolveMediaUrl } from "./media";
import { getSigner, ensureNostrProfile } from "./nostrAuth";
import { NOSTR_RELAYS, getPool } from "./nostrFeed";

const PREF_KEY = "rougee:mirror-nostr";
export const getMirrorPref = (): boolean => {
  try {
    return localStorage.getItem(PREF_KEY) === "1";
  } catch {
    return false;
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
): Promise<void> {
  const d = decodeBody(body);
  let text = "";
  const refs: string[] = [];
  if (d.kind === "text") text = d.text;
  else if (d.kind === "photo") {
    text = d.data.cap ?? "";
    refs.push(d.data.cid);
  } else if (d.kind === "video") {
    text = d.data.cap ?? "";
    refs.push(d.data.cid);
  } else if (d.kind === "carousel") {
    text = d.data.cap ?? "";
    for (const it of d.data.items) refs.push(it.cid);
  } else {
    return; // skip story / profile / note
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
    tags: [["t", "rougee"], ...urls.map((u) => ["imeta", `url ${u}`])],
    content,
  });
  await Promise.allSettled(getPool().publish(NOSTR_RELAYS, ev));
}
