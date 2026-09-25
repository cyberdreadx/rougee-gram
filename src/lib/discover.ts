import type { SocialPost } from "@rougechain/sdk";
import { decodeBody, postOptions } from "./envelope";

/**
 * Helpers for hashtag + location discovery. There's no server-side content
 * index, so tag/location pages filter the (recent) global timeline client-side
 * with these — exhaustive history needs a node-side index (see docs).
 */

// A hashtag is #<letters/digits/underscore>, unicode-aware. Captured so String
// .split keeps the tags as separate segments for linkifying.
export const HASHTAG_RE = /(#[\p{L}\p{N}_]+)/gu;

/** The human text of a post (caption for media, body for text posts). */
export function postText(post: SocialPost): string {
  const d = decodeBody(post.body);
  if (d.kind === "text") return post.body;
  if (d.kind === "photo" || d.kind === "video") return d.data.cap ?? "";
  if (d.kind === "carousel") return d.data.cap ?? "";
  return "";
}

/** Lowercased hashtags found in a post's text (no leading #, deduped). */
export function postHashtags(post: SocialPost): string[] {
  const out = new Set<string>();
  for (const m of postText(post).matchAll(HASHTAG_RE)) {
    out.add(m[1].slice(1).toLowerCase());
  }
  return [...out];
}

/** A post's location label (free text), or "". */
export function postLocation(post: SocialPost): string {
  return postOptions(decodeBody(post.body)).location ?? "";
}

/** Loose match so "New York" ≈ "new york " — case/space-insensitive. */
export function locationMatches(a: string, b: string): boolean {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  return !!a && norm(a) === norm(b);
}
