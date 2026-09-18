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
  links: ProfileLink[]; // link-in-bio entries (sanitized)
  vfy: string; // verified-badge attestation (HQ signature hex), "" if none
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
    links: [],
    vfy: "",
  };

  try {
    const { posts } = await rc().social.getUserPosts(pubkey, 30, 0);
    const latest = findLatestProfile(posts);
    if (latest) {
      base.name = latest.name?.trim() || "";
      base.bio = latest.bio?.trim() || "";
      base.avatarRef = latest.avatar || "";
      base.links = sanitizeLinks(latest.links);
      base.vfy = typeof latest.vfy === "string" ? latest.vfy : "";
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
