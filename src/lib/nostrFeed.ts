/**
 * Nostr content for the Discover feed. rougee-gram's native timeline is sparse,
 * so we mix in recent image notes (kind 1 with media) from public Nostr relays —
 * real, flowing content that makes the feed feel alive. These are read-only for
 * now: a Nostr post carries a `nostr` marker and PostCard renders a dedicated,
 * interaction-gated variant (keys/likes/tips stay on RougeChain).
 */
import { SimplePool, type Event } from "nostr-tools";
import type { SocialPost } from "@rougechain/sdk";

export const NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.nostr.band",
];

/** Prefix on a mixed-in Nostr post's id, so rouge-only code can skip it. */
export const NOSTR_ID_PREFIX = "nostr:";

export interface NostrMeta {
  /** author x-only pubkey (hex) */
  pubkey: string;
  /** display name — from kind-0, else a short pubkey */
  name: string;
  /** avatar url from kind-0, if any */
  avatar?: string;
  /** image urls pulled from the note (imeta tags + inline urls) */
  images: string[];
  /** link out to the note on a Nostr web client */
  noteUrl: string;
}

/** A feed item: a native RougeChain post, or a mixed-in Nostr note (has `nostr`). */
export type FeedPost = SocialPost & { nostr?: NostrMeta };

export const isNostrPost = (p: { id: string }): boolean =>
  p.id.startsWith(NOSTR_ID_PREFIX);

let pool: SimplePool | null = null;
const getPool = (): SimplePool => (pool ??= new SimplePool());

const IMG_RE =
  /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|avif)(?:\?[^\s]*)?)/gi;

function imagesOf(e: Event): string[] {
  const urls = new Set<string>();
  for (const tag of e.tags) {
    // NIP-92 imeta: ["imeta", "url https://…", "m image/jpeg", …]
    if (tag[0] === "imeta") {
      const u = tag.find((x) => typeof x === "string" && x.startsWith("url "));
      if (u) urls.add(u.slice(4).trim());
    }
    if (tag[0] === "image" && tag[1]) urls.add(tag[1]);
  }
  for (const m of e.content.matchAll(IMG_RE)) urls.add(m[1]);
  return [...urls].filter((u) => /^https:\/\//i.test(u));
}

/** Note text with the bare image urls (shown as media) stripped out. */
function textOf(content: string, images: string[]): string {
  let s = content;
  for (const u of images) s = s.split(u).join("");
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const shortPk = (hex: string): string => `${hex.slice(0, 8)}…${hex.slice(-4)}`;

/** Milliseconds from a rouge (string) or nostr (seconds) created_at. */
export function toMs(input: string | number | undefined): number {
  if (input == null) return 0;
  const n = typeof input === "number" ? input : Number(input);
  if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  const parsed = Date.parse(String(input));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Recent Nostr image notes mapped to FeedPost. Pulls kind-1 notes with media,
 * drops replies, and resolves kind-0 profiles for author name/avatar.
 */
export async function fetchNostrFeed(limit = 40, maxWait = 4500): Promise<FeedPost[]> {
  const p = getPool();
  const notes = await p.querySync(
    NOSTR_RELAYS,
    { kinds: [1], limit: limit * 4 },
    { maxWait },
  );

  const picked = notes
    .filter((e) => !e.tags.some((t) => t[0] === "e")) // skip replies
    .map((e) => ({ e, images: imagesOf(e) }))
    .filter((x) => x.images.length > 0)
    .sort((a, b) => b.e.created_at - a.e.created_at)
    .slice(0, limit);

  const authors = [...new Set(picked.map((x) => x.e.pubkey))];
  const profiles = new Map<string, { name?: string; picture?: string }>();
  if (authors.length) {
    const metas = await p.querySync(
      NOSTR_RELAYS,
      { kinds: [0], authors },
      { maxWait },
    );
    for (const m of metas) {
      if (profiles.has(m.pubkey)) continue;
      try {
        const j = JSON.parse(m.content) as { name?: string; display_name?: string; picture?: string };
        profiles.set(m.pubkey, { name: j.display_name || j.name, picture: j.picture });
      } catch {
        /* ignore malformed profile */
      }
    }
  }

  return picked.map(({ e, images }) => {
    const prof = profiles.get(e.pubkey);
    return {
      id: `${NOSTR_ID_PREFIX}${e.id}`,
      author_pubkey: e.pubkey,
      body: textOf(e.content, images),
      reply_to_id: null,
      created_at: String(e.created_at),
      nostr: {
        pubkey: e.pubkey,
        name: prof?.name?.trim() || shortPk(e.pubkey),
        avatar: prof?.picture,
        images,
        noteUrl: `https://njump.me/${e.id}`,
      },
    } satisfies FeedPost;
  });
}
