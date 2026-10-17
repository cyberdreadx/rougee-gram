/**
 * "Add to your story": turn an existing feed post into a story that re-shares it.
 *
 * Media posts reuse the post's own media reference (no re-upload) and record the
 * original post id + author (`ref`/`refBy`) so the story can attribute it and
 * tap through. Text and quote-reposts become a text-card story. Returns the
 * encoded story body, or null for post types that can't be re-shared.
 */
import type { SocialPost } from "@rougechain/sdk";
import { decodeBody, encodeStory } from "./envelope";

export function storyBodyFromPost(post: SocialPost): string | null {
  const d = decodeBody(post.body);
  const ref = post.id;
  const refBy = post.author_pubkey;

  switch (d.kind) {
    case "photo":
      return encodeStory({
        cid: d.data.cid,
        mime: d.data.mime,
        w: d.data.w,
        h: d.data.h,
        ref,
        refBy,
      });
    case "carousel": {
      const it = d.data.items[0];
      if (!it) return null;
      return encodeStory({ cid: it.cid, mime: it.mime, w: it.w, h: it.h, ref, refBy });
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
        refBy,
      });
    case "text": {
      const txt = (d.text || "").trim().slice(0, 280);
      return txt ? encodeStory({ txt, ref, refBy }) : null;
    }
    case "repost": {
      // A quote-repost re-shares as its comment; a bare repost has no text.
      const txt = (d.data.cap || "").trim().slice(0, 280);
      return txt ? encodeStory({ txt, ref, refBy }) : null;
    }
    default:
      // story / profile / note aren't re-shareable to a story.
      return null;
  }
}
