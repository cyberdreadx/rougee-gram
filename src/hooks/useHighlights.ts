import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SocialPost } from "@rougechain/sdk";
import {
  getHighlights,
  getStoryArchive,
  type Highlight,
  type StoryItem,
} from "@/lib/highlights";
import { useAuth } from "@/store/auth";
import { encodeHighlight } from "@/lib/envelope";
import { rc } from "@/lib/rouge";
import * as write from "@/lib/write";

export type { Highlight, StoryItem };

export function useHighlights(pubkey: string | undefined) {
  return useQuery({
    queryKey: ["highlights", pubkey],
    enabled: Boolean(pubkey),
    staleTime: 60_000,
    queryFn: () => getHighlights(pubkey as string),
  });
}

/** The viewer's own past stories, to pick from when building a highlight. */
export function useStoryArchive(pubkey: string | undefined) {
  return useQuery({
    queryKey: ["storyArchive", pubkey],
    enabled: Boolean(pubkey),
    staleTime: 60_000,
    queryFn: () => getStoryArchive(pubkey as string),
  });
}

/** Resolve a highlight's story ids to story posts (viewing order) for the viewer. */
export function useHighlightStories(items: string[] | undefined) {
  const key = (items ?? []).join(",");
  return useQuery({
    queryKey: ["highlightStories", key],
    enabled: Boolean(items && items.length),
    staleTime: 60_000,
    queryFn: async (): Promise<SocialPost[]> => {
      const ids = items ?? [];
      const resolved = await Promise.all(
        ids.map((id) =>
          rc()
            .social.getPost(id)
            .then((r) => r?.post ?? null)
            .catch(() => null),
        ),
      );
      return resolved.filter((p): p is SocialPost => !!p); // keep order, drop missing
    },
  });
}

function genHid(): string {
  return [...crypto.getRandomValues(new Uint8Array(8))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Create / edit / delete highlights (each is a signed on-chain post). */
export function useManageHighlights() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  const invalidate = () => client.invalidateQueries({ queryKey: ["highlights", publicKey] });

  const save = async (h: {
    hid?: string;
    title: string;
    cover?: string;
    items: string[];
  }): Promise<string> => {
    if (!wallet) throw new Error("Unlock your wallet first.");
    if (!h.items.length) throw new Error("Pick at least one story.");
    const hid = h.hid || genHid();
    const body = encodeHighlight({
      hid,
      title: h.title.trim() || "Highlights",
      cover: h.cover || undefined,
      items: h.items,
    });
    const res = await write.createPost({ wallet, publicKey, isExtensionWallet }, body);
    if (!res.success) throw new Error(res.error || "Couldn't save highlight.");
    invalidate();
    return hid;
  };

  const remove = async (hid: string): Promise<void> => {
    if (!wallet) throw new Error("Unlock your wallet first.");
    const body = encodeHighlight({ hid, title: "", items: [], del: true });
    const res = await write.createPost({ wallet, publicKey, isExtensionWallet }, body);
    if (!res.success) throw new Error(res.error || "Couldn't delete highlight.");
    invalidate();
  };

  return { save, remove };
}
