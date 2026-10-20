import { useQuery } from "@tanstack/react-query";
import { rc } from "@/lib/rouge";
import { getConfig } from "@/lib/config";
import { soundsEnabled, fetchSoundReels, fetchTrendingSounds } from "@/lib/sounds";

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
  /** Normalized waveform peaks (0–1) from qRougee, for a real scrubber. */
  waveform?: number[];
  /** The track's "hook" window (seconds) — where a reel should start by default. */
  previewStart?: number;
  previewEnd?: number;
}

interface TrackAttrs {
  artist?: string;
  duration?: string | number;
  coverUrl?: string;
  audioUrl?: string;
  waveform?: number[];
  previewStart?: number | string;
  previewEnd?: number | string;
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
                waveform: Array.isArray(attrs.waveform) ? attrs.waveform : undefined,
                previewStart: attrs.previewStart != null ? Number(attrs.previewStart) : undefined,
                previewEnd: attrs.previewEnd != null ? Number(attrs.previewEnd) : undefined,
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

/** The person to pay/credit for a track, resolved from its qRougee NFT. */
export interface TrackArtist {
  /** Collection/track name (display). */
  name: string;
  /** Payable rouge address (royalty recipient, else creator). "" if none. */
  address: string;
  /** Deep link to the track on qRougee. */
  trackUrl: string;
}

/** Split a `<collectionId>_<tokenId>` sound id back into its parts. */
function splitTrackId(id: string): { collectionId: string; tokenId: string } {
  const i = id.lastIndexOf("_");
  return i < 0
    ? { collectionId: id, tokenId: "" }
    : { collectionId: id.slice(0, i), tokenId: id.slice(i + 1) };
}

/** Normalize an on-chain identity to a payable rouge address (resolve a pubkey). */
async function toPayable(x: string): Promise<string> {
  if (!x) return "";
  if (x.startsWith("rouge1")) return x; // already an address
  try {
    const r = await rc().resolveAddress(x);
    return r.address || "";
  } catch {
    return "";
  }
}

/**
 * Resolve the payable artist behind a track (by its `<collectionId>_<tokenId>`
 * sound id). Payout target is the collection's royalty recipient, falling back
 * to its creator. Used to credit + tip the artist on a reel. Cached hard — track
 * ownership rarely changes within a session.
 */
export function useTrackArtist(trackId: string | undefined) {
  return useQuery({
    queryKey: ["track-artist", trackId],
    enabled: !!trackId,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<TrackArtist | null> => {
      const { collectionId } = splitTrackId(trackId as string);
      if (!collectionId) return null;
      const col = await rc().nft.getCollection(collectionId);
      const address = await toPayable(col.royalty_recipient || col.creator || "");
      return {
        name: col.name || "",
        address,
        trackUrl: `https://music.rougee.app/track/${encodeURIComponent(trackId as string)}`,
      };
    },
  });
}

/** The full track behind a sound id, read from its qRougee NFT (for a sound page
 *  header + "use this sound"). Returns null if the token isn't a playable track. */
export function useSoundTrack(soundId: string | undefined) {
  return useQuery({
    queryKey: ["sound-track", soundId],
    enabled: !!soundId,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Sound | null> => {
      const { collectionId, tokenId } = splitTrackId(soundId as string);
      const tid = Number(tokenId);
      if (!collectionId || !Number.isFinite(tid)) return null;
      const token = await rc().nft.getToken(collectionId, tid);
      const attrs = (token.attributes || {}) as TrackAttrs;
      if (!attrs.audioUrl) return null;
      return {
        id: soundId as string,
        title: token.name || "Untitled",
        artist: attrs.artist || "",
        coverUrl: attrs.coverUrl || "",
        audioUrl: attrs.audioUrl,
        duration: Number(attrs.duration) || 0,
        waveform: Array.isArray(attrs.waveform) ? attrs.waveform : undefined,
        previewStart: attrs.previewStart != null ? Number(attrs.previewStart) : undefined,
        previewEnd: attrs.previewEnd != null ? Number(attrs.previewEnd) : undefined,
      };
    },
  });
}

/** Reels using a track (from the sounds Worker). Empty while the Worker is dormant. */
export function useSoundReels(soundId: string | undefined) {
  return useQuery({
    queryKey: ["sound-reels", soundId, getConfig().network],
    enabled: !!soundId && soundsEnabled(),
    staleTime: 60_000,
    queryFn: () => fetchSoundReels(soundId as string),
  });
}

/** Most-used tracks (from the sounds Worker). Empty while the Worker is dormant. */
export function useTrendingSounds(limit = 20) {
  return useQuery({
    queryKey: ["trending-sounds", limit, getConfig().network],
    enabled: soundsEnabled(),
    staleTime: 60_000,
    queryFn: () => fetchTrendingSounds(limit),
  });
}
