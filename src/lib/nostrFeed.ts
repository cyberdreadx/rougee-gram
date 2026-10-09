/**
 * Nostr content for the Discover feed. rougee-gram's native timeline is sparse,
 * so we stream in recent image notes (kind 1 with media) from public Nostr
 * relays — real, flowing content that makes the feed feel alive. New arrivals
 * are held and surfaced via a "N new posts" pill (see useNostrStream), the way
 * GLTCH's feed does. Read-only for now: a Nostr post carries a `nostr` marker
 * and NostrPostCard renders a dedicated, interaction-gated variant.
 */
import { SimplePool, type Event } from "nostr-tools";
import type { SocialPost } from "@rougechain/sdk";

export const NOSTR_RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.nostr.band",
  "wss://relay.snort.social",
  "wss://nostr.mom",
  "wss://offchain.pub",
];

/** Prefix on a mixed-in Nostr post's id, so rouge-only code can skip it. */
export const NOSTR_ID_PREFIX = "nostr:";

export interface NostrProfile {
  name?: string;
  picture?: string;
  about?: string;
  nip05?: string;
  banner?: string;
  website?: string;
}

export interface NostrMeta {
  pubkey: string; // author x-only pubkey (hex)
  name: string; // display name — from kind-0, else a short pubkey
  avatar?: string; // avatar url from kind-0, if any
  images: string[]; // image urls pulled from the note
  videos: string[]; // video urls pulled from the note (played inline)
  noteUrl: string; // link out to a Nostr web client
  likeCount?: number; // live interaction counts (kind-7/1/6 referencing this note)
  replyCount?: number;
  repostCount?: number;
}

/** A feed item: a native RougeChain post, or a mixed-in Nostr note (has `nostr`). */
export type FeedPost = SocialPost & { nostr?: NostrMeta };

export const isNostrPost = (p: { id: string }): boolean =>
  p.id.startsWith(NOSTR_ID_PREFIX);

let pool: SimplePool | null = null;
export const getPool = (): SimplePool => (pool ??= new SimplePool());

const IMG_RE = /(https?:\/\/[^\s]+\.(?:jpg|jpeg|png|gif|webp|avif)(?:\?[^\s]*)?)/gi;
const VIDEO_RE = /(https?:\/\/[^\s]+\.(?:mp4|webm|mov|m4v|ogv)(?:\?[^\s]*)?)/gi;
const IMG_EXT = /\.(?:jpg|jpeg|png|gif|webp|avif)(?:\?|$)/i;
const VIDEO_EXT = /\.(?:mp4|webm|mov|m4v|ogv)(?:\?|$)/i;

/** NIP-92 imeta entries: ["imeta", "url https://…", "m image/jpeg", …] */
function imetaEntries(e: Event): { url: string; mime: string }[] {
  const out: { url: string; mime: string }[] = [];
  for (const tag of e.tags) {
    if (tag[0] !== "imeta") continue;
    const url = tag.find((x) => typeof x === "string" && x.startsWith("url "))?.slice(4).trim();
    const mime = tag.find((x) => typeof x === "string" && x.startsWith("m "))?.slice(2).trim() ?? "";
    if (url) out.push({ url, mime });
  }
  return out;
}

export function imagesOf(e: Event): string[] {
  const urls = new Set<string>();
  for (const { url, mime } of imetaEntries(e)) {
    if (mime.startsWith("image") || IMG_EXT.test(url)) urls.add(url);
  }
  for (const tag of e.tags) if (tag[0] === "image" && tag[1]) urls.add(tag[1]);
  for (const m of e.content.matchAll(IMG_RE)) urls.add(m[1]);
  return [...urls].filter((u) => /^https:\/\//i.test(u));
}

export function videosOf(e: Event): string[] {
  const urls = new Set<string>();
  for (const { url, mime } of imetaEntries(e)) {
    if (mime.startsWith("video") || VIDEO_EXT.test(url)) urls.add(url);
  }
  for (const m of e.content.matchAll(VIDEO_RE)) urls.add(m[1]);
  return [...urls].filter((u) => /^https:\/\//i.test(u));
}

/** Note text with the bare media urls (shown inline) stripped out. */
function textOf(content: string, media: string[]): string {
  let s = content;
  for (const u of media) s = s.split(u).join("");
  return s.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

const shortPk = (hex: string): string => `${hex.slice(0, 8)}…${hex.slice(-4)}`;

const MAX_NOTE_CHARS = 2000;

/** Drop app traffic masquerading as notes (JSON blobs, long opaque tokens). */
export function isMachineNote(content: string): boolean {
  const t = content.trim();
  if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
    try {
      JSON.parse(t);
      return true;
    } catch {
      /* not JSON — keep */
    }
  }
  return t.length >= 64 && !/\s/.test(t) && /^[A-Za-z0-9+/=_-]+$/.test(t);
}

/** A renderable Discover item: an image post, not a reply, not machine/junk. */
export function isFeedNote(e: Event): boolean {
  if (e.tags.some((t) => t[0] === "e" || t[0] === "content-warning")) return false;
  if (e.content.trim().length > MAX_NOTE_CHARS) return false;
  if (isMachineNote(e.content)) return false;
  return imagesOf(e).length > 0 || videosOf(e).length > 0;
}

/** Lowercase hashtags from #t tags + inline #tags in the content. */
export function hashtagsOf(e: Event): string[] {
  const out = new Set<string>();
  for (const t of e.tags) if (t[0] === "t" && t[1]) out.add(t[1].toLowerCase());
  for (const m of e.content.matchAll(/#([a-z0-9_]{2,30})/gi)) out.add(m[1].toLowerCase());
  return [...out];
}

/** Curated Discover topic chips; `id: null` = the random firehose. */
export const DISCOVER_TOPICS: { id: string | null; label: string }[] = [
  { id: null, label: "All" },
  { id: "art", label: "#art" },
  { id: "photography", label: "#photography" },
  { id: "music", label: "#music" },
  { id: "memes", label: "#memes" },
  { id: "cyberpunk", label: "#cyberpunk" },
  { id: "nostr", label: "#nostr" },
  { id: "bitcoin", label: "#bitcoin" },
];

/** Map a kind-1 event + optional kind-0 profile to a FeedPost. */
export function eventToFeedPost(e: Event, prof?: NostrProfile): FeedPost {
  const images = imagesOf(e);
  const videos = videosOf(e);
  return {
    id: `${NOSTR_ID_PREFIX}${e.id}`,
    author_pubkey: e.pubkey,
    body: textOf(e.content, [...images, ...videos]),
    reply_to_id: null,
    created_at: String(e.created_at),
    nostr: {
      pubkey: e.pubkey,
      name: prof?.name?.trim() || shortPk(e.pubkey),
      avatar: prof?.picture,
      images,
      videos,
      noteUrl: `https://njump.me/${e.id}`,
    },
  };
}

/** Parse a kind-0 profile event's content. */
export function parseProfile(content: string): NostrProfile | null {
  try {
    const j = JSON.parse(content) as {
      name?: string;
      display_name?: string;
      picture?: string;
      about?: string;
      nip05?: string;
      banner?: string;
      website?: string;
    };
    return {
      name: j.display_name || j.name,
      picture: j.picture,
      about: j.about,
      nip05: j.nip05,
      banner: j.banner,
      website: j.website,
    };
  } catch {
    return null;
  }
}

/** Milliseconds from a rouge (string) or nostr (seconds) created_at. */
export function toMs(input: string | number | undefined): number {
  if (input == null) return 0;
  const n = typeof input === "number" ? input : Number(input);
  if (Number.isFinite(n)) return n < 1e12 ? n * 1000 : n;
  const parsed = Date.parse(String(input));
  return Number.isFinite(parsed) ? parsed : 0;
}
