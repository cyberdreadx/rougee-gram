import type { EventTemplate } from "nostr-tools";

/**
 * NIP-89 app handler: announces Rougee on Nostr so other clients can offer
 * "open in Rougee", and directories that read handler events can list it.
 * Kind 31990 = handler information (the app describing itself); kind 31989 =
 * a user recommending a handler for an event kind.
 */
export const APP_ORIGIN = "https://rougee.app";
export const HANDLER_D = "rougee";
/** Event kinds Rougee can display: profiles (0) and notes (1). */
export const HANDLED_KINDS = [0, 1];

export function buildHandlerEvent(): EventTemplate {
  const open = `${APP_ORIGIN}/open/<bech32>`;
  return {
    kind: 31990,
    created_at: Math.floor(Date.now() / 1000),
    content: JSON.stringify({
      name: "Rougee",
      display_name: "Rougee",
      about:
        "Photo, video & reels social app across RougeChain and Nostr. Discover feed, custom feeds, stories and tips.",
      picture: `${APP_ORIGIN}/pwa-512x512.png`,
      banner: `${APP_ORIGIN}/og-image.png`,
      website: APP_ORIGIN,
    }),
    tags: [
      ["d", HANDLER_D],
      ...HANDLED_KINDS.map((k) => ["k", String(k)]),
      ["web", open, "npub"],
      ["web", open, "nprofile"],
      ["web", open, "note"],
      ["web", open, "nevent"],
      ["web", open],
      ["t", "photo"],
      ["t", "video"],
      ["t", "social"],
    ],
  };
}

/** The signer's recommendation of the Rougee handler for each handled kind. */
export function buildRecommendations(handlerPubkey: string): EventTemplate[] {
  const now = Math.floor(Date.now() / 1000);
  return HANDLED_KINDS.map((k) => ({
    kind: 31989,
    created_at: now,
    content: "",
    tags: [
      ["d", String(k)],
      ["a", `31990:${handlerPubkey}:${HANDLER_D}`, "wss://relay.damus.io", "web"],
    ],
  }));
}
