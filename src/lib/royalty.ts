/**
 * Creator ↔ artist royalty split for reels that use a qRougee track. When a fan
 * tips a reel's creator, a share of that tip routes on-chain to the track's
 * artist (its NFT royalty recipient). The split is a product choice, not a legal
 * one — rougee owns the music license — so it's a flat default, tunable here.
 */
export const ROYALTY_BPS = 1500; // 15% to the artist; creator keeps the rest

/** Split a tip into the creator's and the artist's portions (artist floored). */
export function splitRoyalty(
  amount: number,
  bps: number = ROYALTY_BPS,
): { creator: number; artist: number } {
  const artist = Math.floor((amount * bps) / 10000);
  return { creator: amount - artist, artist };
}
