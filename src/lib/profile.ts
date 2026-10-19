import { rc } from "./rouge";
import { resolveAddress, handleFromAddress } from "./format";
import { decodeBody, sanitizeLinks, type ProfileEnvelope, type ProfileLink } from "./envelope";

/**
 * Profiles have no dedicated on-chain endpoint, so a user's profile is derived
 * from the most recent `profile`-type post they authored. This keeps identity
 * fully decentralized — no profile database, just signed posts.
 */

export interface Profile {
  pubkey: string;
  address: string;
  handle: string;
  name: string;
  bio: string;
  avatarRef: string; // media reference URI or ""
  bannerRef: string; // cover/banner media reference URI or ""
  bannerPos: number; // cover vertical framing (object-position Y %, 50 = center)
  links: ProfileLink[]; // link-in-bio entries (sanitized)
  vfy: string; // verified-badge attestation (HQ signature hex), "" if none
  pins: string[]; // pinned post ids (shown first on the profile grid)
  subPrice: number; // monthly subscription price in XRGE (0 = not a creator sub)
}

const cache = new Map<string, { at: number; profile: Profile }>();
const TTL = 60_000;

export async function getProfile(pubkey: string): Promise<Profile> {
  const cached = cache.get(pubkey);
  if (cached && Date.now() - cached.at < TTL) return cached.profile;

  const address = await resolveAddress(pubkey);
  const base: Profile = {
    pubkey,
    address,
    handle: handleFromAddress(address),
    name: "",
    bio: "",
    avatarRef: "",
    bannerRef: "",
    bannerPos: 50,
    links: [],
    vfy: "",
    pins: [],
    subPrice: 0,
  };

  try {
    const { posts } = await rc().social.getUserPosts(pubkey, 30, 0);
    const latest = findLatestProfile(posts);
    if (latest) {
      base.name = latest.name?.trim() || "";
      base.bio = latest.bio?.trim() || "";
      base.avatarRef = latest.avatar || "";
      base.bannerRef = latest.banner || "";
      base.bannerPos =
        typeof latest.bpos === "number" && latest.bpos >= 0 && latest.bpos <= 100
          ? latest.bpos
          : 50;
      base.links = sanitizeLinks(latest.links);
      base.vfy = typeof latest.vfy === "string" ? latest.vfy : "";
      base.pins = Array.isArray(latest.pins)
        ? latest.pins.filter((id): id is string => typeof id === "string" && !!id).slice(0, 3)
        : [];
      base.subPrice = typeof latest.sub === "number" && latest.sub > 0 ? Math.floor(latest.sub) : 0;
    }
  } catch {
    /* keep the address-derived defaults */
  }

  cache.set(pubkey, { at: Date.now(), profile: base });
  return base;
}

export function invalidateProfile(pubkey: string): void {
  cache.delete(pubkey);
}

/** Drop all cached profiles — used when switching networks. */
export function clearProfileCache(): void {
  cache.clear();
}

export function displayName(p: Profile): string {
  return p.name || p.handle;
}

function findLatestProfile(
  posts: { body: string; created_at: string }[],
): ProfileEnvelope | null {
  // getUserPosts returns newest-first; take the first profile envelope found.
  for (const post of posts) {
    const decoded = decodeBody(post.body);
    if (decoded.kind === "profile") return decoded.data;
  }
  return null;
}
