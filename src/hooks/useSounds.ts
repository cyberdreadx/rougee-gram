import { useQuery } from "@tanstack/react-query";
import { rc } from "@/lib/rouge";

/**
 * A selectable "sound" for reels, sourced from qRougee (music.rougee.app). Both
 * apps run on the same RougeChain, and qRougee stores each track as an NFT whose
 * `attributes` blob carries a playable `audioUrl` + metadata — so we can read the
 * catalog directly here (no separate music API needed) and mix a track over a reel.
 */
export interface Sound {
  /** `<collectionId>_<tokenId>` — deep-links back to the qRougee track. */
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  audioUrl: string;
  /** Seconds, 0 if unknown. */
  duration: number;
}

interface TrackAttrs {
  artist?: string;
  duration?: string | number;
  coverUrl?: string;
  audioUrl?: string;
}

/** The qRougee music catalog (NFT tracks with a playable audio URL), newest first. */
export function useSounds() {
  return useQuery({
    queryKey: ["sounds"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Sound[]> => {
      const collections = await rc().nft.getCollections();
      const rows: Array<Sound & { mintedAt: number }> = [];
      await Promise.all(
        collections.map(async (col) => {
          try {
            const { tokens } = await rc().nft.getTokens(col.collection_id, { limit: 50 });
            for (const token of tokens) {
              const attrs = (token.attributes || {}) as TrackAttrs;
              // Only NFTs that are actually tracks (have playable audio).
              if (!attrs.audioUrl) continue;
              rows.push({
                id: `${token.collection_id}_${token.token_id}`,
                title: token.name || "Untitled",
                artist: attrs.artist || "",
                coverUrl: attrs.coverUrl || col.image || "",
                audioUrl: attrs.audioUrl,
                duration: Number(attrs.duration) || 0,
                mintedAt: token.minted_at ?? 0,
              });
            }
          } catch {
            /* skip unreadable collections */
          }
        }),
      );
      rows.sort((a, b) => b.mintedAt - a.mintedAt); // newest first
      return rows.map(({ mintedAt, ...s }) => s); // eslint-disable-line @typescript-eslint/no-unused-vars
    },
  });
}
