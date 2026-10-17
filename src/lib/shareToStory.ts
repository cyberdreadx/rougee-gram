/**
 * "Add to your story": turn an existing feed post into a story that re-shares it.
 *
 * Media posts reuse the post's own media reference (no re-upload) and record the
 * original post id (`ref`) so the story can attribute it and tap through. Text
 * and quote-reposts become a text-card story. Returns the encoded story body, or
 * null for post types that can't be re-shared.
 *
 * NOTE: we store only the post id (`ref`), never the author pubkey — a RougeChain
 * pubkey is ~3,900 chars and would blow past the 4,000-char on-chain post limit.
 * The viewer resolves the author from the referenced post instead.
 */
import type { SocialPost } from "@rougechain/sdk";
import { decodeBody, encodeStory } from "./envelope";

/** True if `post` is a type that can be re-shared to a story. Cheap (no encode),
 *  safe to call during render. */
export function canShareToStory(post: { body: string }): boolean {
  const d = decodeBody(post.body);
  switch (d.kind) {
    case "photo":
    case "video":
      return true;
    case "carousel":
      return d.data.items.length > 0;
    case "text":
      return (d.text || "").trim().length > 0;
    case "repost":
      return (d.data.cap || "").trim().length > 0;
    default:
      return false;
  }
}

export function storyBodyFromPost(post: SocialPost): string | null {
  const d = decodeBody(post.body);
  const ref = post.id;
  try {
    switch (d.kind) {
      case "photo":
        return encodeStory({ cid: d.data.cid, mime: d.data.mime, w: d.data.w, h: d.data.h, ref });
      case "carousel": {
        const it = d.data.items[0];
        if (!it) return null;
        return encodeStory({ cid: it.cid, mime: it.mime, w: it.w, h: it.h, ref });
      }
      case "video":
        return encodeStory({
          cid: d.data.cid,
          mime: d.data.mime,
          w: d.data.w,
          h: d.data.h,
          dur: d.data.dur,
          poster: d.data.poster,
          ref,
        });
      case "text": {
        const txt = (d.text || "").trim().slice(0, 280);
        return txt ? encodeStory({ txt, ref }) : null;
      }
      case "repost": {
        const txt = (d.data.cap || "").trim().slice(0, 280);
        return txt ? encodeStory({ txt, ref }) : null;
      }
      default:
        return null;
    }
  } catch {
    // Never let a size/encoding edge case bubble up — just mean "can't share".
    return null;
  }
}
