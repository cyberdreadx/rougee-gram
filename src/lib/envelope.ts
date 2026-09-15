/**
 * Post-body envelope.
 *
 * RougeChain's social layer stores a post as a plain-text `body` (max 4000 chars)
 * with no media field. RouGee encodes a compact JSON envelope into that body
 * so a photo post is just a normal on-chain post that also happens to point at a
 * content-addressed image.
 *
 * A media reference (`cid`) is a URI:
 *   - `ipfs://<cid>`   — pinned on IPFS (portable, censorship-resistant)
 *   - `local://<hash>` — stored in this browser's IndexedDB (dev fallback)
 *
 * Bodies that are not valid RouGee envelopes (e.g. plain-text posts already
 * on-chain from other apps) are surfaced as `{ kind: "text" }` so the feed still
 * renders them gracefully.
 */

export const POST_BODY_LIMIT = 4000;
export const CAPTION_LIMIT = 2200;
export const BIO_LIMIT = 300;
export const NAME_LIMIT = 40;

/**
 * Per-post publishing options that travel with the post so every client honors
 * them (there's no server to enforce settings). Compact keys keep the envelope
 * small. Only meaningful, decentralization-appropriate settings are included —
 * things like "schedule" or "hide download" don't apply to public on-chain posts.
 */
export interface PostOptions {
  /** Hide the like count from viewers (the post is still likeable). */
  hl?: boolean;
  /** Turn off commenting. */
  nc?: boolean;
}

export interface PhotoEnvelope extends PostOptions {
  v: 1;
  t: "photo";
  /** Media reference URI: ipfs://… or local://… */
  cid: string;
  mime: string;
  w?: number;
  h?: number;
  /** Caption */
  cap?: string;
  /** Alt text for accessibility */
  alt?: string;
}

export interface VideoEnvelope extends PostOptions {
  v: 1;
  /** "video" = regular clip, "reel" = vertical short shown in the reels feed */
  t: "video" | "reel";
  /** Video media reference URI: ipfs://… or local://… */
  cid: string;
  mime: string;
  w?: number;
  h?: number;
  /** Duration in seconds */
  dur?: number;
  /** Poster/thumbnail media reference URI (an image) */
  poster?: string;
  /** Non-destructive trim: playback is limited to [start, end] seconds. */
  start?: number;
  end?: number;
  /** Non-destructive display crop, e.g. "9:16" (players use object-cover). */
  crop?: string;
  /** Caption */
  cap?: string;
  /** Alt text for accessibility */
  alt?: string;
}

export interface CarouselItem {
  cid: string;
  mime: string;
  w?: number;
  h?: number;
}

export interface CarouselEnvelope extends PostOptions {
  v: 1;
  t: "carousel";
  items: CarouselItem[];
  cap?: string;
  alt?: string;
}

export const CAROUSEL_MAX = 10;

export interface StoryEnvelope {
  v: 1;
  t: "story";
  /** Media reference URI (image or video): ipfs://… / local://… / https://… */
  cid: string;
  mime: string;
  w?: number;
  h?: number;
  /** Duration in seconds (video stories) */
  dur?: number;
  /** Poster/thumbnail media reference (video stories) */
  poster?: string;
  /** Optional caption / text overlay */
  cap?: string;
}

export interface ProfileEnvelope {
  v: 1;
  t: "profile";
  name?: string;
  bio?: string;
  /** Avatar media reference URI, or "" to clear */
  avatar?: string;
}

/** A "note" — a short, ephemeral text status shown in the DM inbox (à la IG). */
export interface NoteEnvelope {
  v: 1;
  t: "note";
  /** Short note text */
  txt: string;
}

export const NOTE_LIMIT = 60;
/** Notes are ephemeral by convention — clients only show them within 24h. */
export const NOTE_TTL_MS = 24 * 60 * 60 * 1000;

export type Decoded =
  | { kind: "photo"; data: PhotoEnvelope }
  | { kind: "video"; data: VideoEnvelope }
  | { kind: "carousel"; data: CarouselEnvelope }
  | { kind: "story"; data: StoryEnvelope }
  | { kind: "note"; data: NoteEnvelope }
  | { kind: "profile"; data: ProfileEnvelope }
  | { kind: "text"; text: string };

/** Publishing options for any media post (photo/video/carousel). */
export function postOptions(d: Decoded): { hideLikes: boolean; noComments: boolean } {
  if (d.kind === "photo" || d.kind === "video" || d.kind === "carousel") {
    const data = d.data as PostOptions;
    return { hideLikes: !!data.hl, noComments: !!data.nc };
  }
  return { hideLikes: false, noComments: false };
}

/** Stories are ephemeral by convention: shown only within this window. The
 *  chain is immutable, so "expired" just means the client stops showing it. */
export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export function encodePhoto(env: Omit<PhotoEnvelope, "v" | "t">): string {
  const full: PhotoEnvelope = { v: 1, t: "photo", ...env };
  if (full.cap) full.cap = full.cap.slice(0, CAPTION_LIMIT);
  const json = JSON.stringify(stripUndefined(full));
  if (json.length > POST_BODY_LIMIT) {
    throw new Error("Caption too long for a single on-chain post.");
  }
  return json;
}

export function encodeCarousel(
  env: Omit<CarouselEnvelope, "v" | "t">,
): string {
  const items = env.items.slice(0, CAROUSEL_MAX);
  const full: CarouselEnvelope = { v: 1, t: "carousel", ...env, items };
  if (full.cap) full.cap = full.cap.slice(0, CAPTION_LIMIT);
  const json = JSON.stringify(stripUndefined(full));
  if (json.length > POST_BODY_LIMIT) {
    throw new Error("Caption too long for a single on-chain post.");
  }
  return json;
}

export function encodeVideo(
  env: Omit<VideoEnvelope, "v"> & { t: "video" | "reel" },
): string {
  const full: VideoEnvelope = { v: 1, ...env };
  if (full.cap) full.cap = full.cap.slice(0, CAPTION_LIMIT);
  const json = JSON.stringify(stripUndefined(full));
  if (json.length > POST_BODY_LIMIT) {
    throw new Error("Caption too long for a single on-chain post.");
  }
  return json;
}

export function encodeStory(env: Omit<StoryEnvelope, "v" | "t">): string {
  const full: StoryEnvelope = { v: 1, t: "story", ...env };
  if (full.cap) full.cap = full.cap.slice(0, CAPTION_LIMIT);
  const json = JSON.stringify(stripUndefined(full));
  if (json.length > POST_BODY_LIMIT) {
    throw new Error("Caption too long for a single on-chain post.");
  }
  return json;
}

export function encodeNote(txt: string): string {
  const full: NoteEnvelope = { v: 1, t: "note", txt: txt.slice(0, NOTE_LIMIT) };
  return JSON.stringify(full);
}

export function encodeProfile(env: Omit<ProfileEnvelope, "v" | "t">): string {
  const full: ProfileEnvelope = { v: 1, t: "profile", ...env };
  if (full.name) full.name = full.name.slice(0, NAME_LIMIT);
  if (full.bio) full.bio = full.bio.slice(0, BIO_LIMIT);
  return JSON.stringify(stripUndefined(full));
}

export function decodeBody(body: string): Decoded {
  const trimmed = (body ?? "").trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      if (obj && obj.v === 1 && obj.t === "photo" && typeof obj.cid === "string") {
        return { kind: "photo", data: obj as unknown as PhotoEnvelope };
      }
      if (
        obj &&
        obj.v === 1 &&
        (obj.t === "video" || obj.t === "reel") &&
        typeof obj.cid === "string"
      ) {
        return { kind: "video", data: obj as unknown as VideoEnvelope };
      }
      if (
        obj &&
        obj.v === 1 &&
        obj.t === "carousel" &&
        Array.isArray((obj as { items?: unknown }).items)
      ) {
        return { kind: "carousel", data: obj as unknown as CarouselEnvelope };
      }
      if (obj && obj.v === 1 && obj.t === "story" && typeof obj.cid === "string") {
        return { kind: "story", data: obj as unknown as StoryEnvelope };
      }
      if (obj && obj.v === 1 && obj.t === "note" && typeof obj.txt === "string") {
        return { kind: "note", data: obj as unknown as NoteEnvelope };
      }
      if (obj && obj.v === 1 && obj.t === "profile") {
        return { kind: "profile", data: obj as unknown as ProfileEnvelope };
      }
    } catch {
      /* not our envelope — fall through to text */
    }
  }
  return { kind: "text", text: body ?? "" };
}

export function isPhotoBody(body: string): boolean {
  return decodeBody(body).kind === "photo";
}

/** True for photo/video/carousel posts (anything with a visual grid thumbnail). */
export function isMediaBody(body: string): boolean {
  const k = decodeBody(body).kind;
  return k === "photo" || k === "video" || k === "carousel";
}

function stripUndefined(obj: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null && v !== "") out[k] = v;
  }
  return out;
}
