/**
 * Story Highlights data layer. A highlight is a dedicated on-chain post
 * (`{t:"highlight"}`) identified by a stable `hid`; the newest post per hid wins,
 * so edits are just re-publishes and deletes are tombstones (`del:true`). The
 * "archive" a user picks stories from is their past story posts — which live on
 * chain forever even after they vanish from the 24h tray.
 */
import type { SocialPost } from "@rougechain/sdk";
import { rc } from "./rouge";
import { decodeBody, type HighlightEnvelope, type StoryEnvelope } from "./envelope";

export interface Highlight {
  hid: string;
  title: string;
  cover: string; // media ref ("" if none)
  items: string[]; // story post ids, viewing order
  at: number; // latest-update ms (for ordering)
}

export interface StoryItem {
  id: string; // story post id
  cid: string; // media ref
  poster?: string;
  mime: string;
  cap?: string;
  at: number;
}

function toMs(s: string): number {
  const n = Number(s);
  if (!Number.isNaN(n) && s.trim() !== "") return n < 1e12 ? n * 1000 : n;
  const p = Date.parse(s);
  return Number.isNaN(p) ? 0 : p;
}

/** Page through a user's posts (newest-first) up to `max`. */
async function scanUserPosts(pubkey: string, max = 300): Promise<SocialPost[]> {
  const out: SocialPost[] = [];
  const PAGE = 50;
  for (let off = 0; off < max; off += PAGE) {
    const { posts } = await rc().social.getUserPosts(pubkey, PAGE, off);
    const batch = (posts ?? []) as SocialPost[];
    out.push(...batch);
    if (batch.length < PAGE) break;
  }
  return out;
}

/** A user's highlights: newest post per hid, tombstones + empties removed. */
export async function getHighlights(pubkey: string): Promise<Highlight[]> {
  const posts = await scanUserPosts(pubkey);
  const latest = new Map<string, { env: HighlightEnvelope; at: number }>();
  for (const p of posts) {
    const d = decodeBody(p.body);
    if (d.kind !== "highlight") continue;
    const at = toMs(p.created_at);
    const cur = latest.get(d.data.hid);
    if (!cur || at >= cur.at) latest.set(d.data.hid, { env: d.data, at });
  }
  const out: Highlight[] = [];
  for (const { env, at } of latest.values()) {
    if (env.del || !env.items?.length) continue;
    out.push({
      hid: env.hid,
      title: env.title || "",
      cover: env.cover || "",
      items: env.items,
      at,
    });
  }
  out.sort((a, b) => b.at - a.at);
  return out;
}

/** The user's past stories (highlight archive) — on-chain story posts, no TTL. */
export async function getStoryArchive(pubkey: string): Promise<StoryItem[]> {
  const posts = await scanUserPosts(pubkey);
  const items: StoryItem[] = [];
  for (const p of posts) {
    const d = decodeBody(p.body);
    if (d.kind !== "story") continue;
    const s = d.data as StoryEnvelope;
    if (!s.cid) continue; // skip text-card re-shares (no thumbnail)
    items.push({
      id: p.id,
      cid: s.cid,
      poster: s.poster,
      mime: s.mime || "",
      cap: s.cap,
      at: toMs(p.created_at),
    });
  }
  items.sort((a, b) => b.at - a.at);
  return items;
}
