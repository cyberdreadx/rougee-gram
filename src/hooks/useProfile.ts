import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, invalidateProfile, type Profile } from "@/lib/profile";
import { useAuth } from "@/store/auth";
import { encodeProfile, PINNED_MAX, type ProfileLink } from "@/lib/envelope";
import { invalidateFeeds } from "./useSocial";
import * as write from "@/lib/write";

export function useProfile(pubkey: string | undefined) {
  return useQuery({
    queryKey: ["profile", pubkey],
    enabled: Boolean(pubkey),
    queryFn: () => getProfile(pubkey as string),
    staleTime: 60_000,
  });
}

/** Convenience accessor for the signed-in user's profile (undefined until loaded). */
export function useMyProfile(): Profile | undefined {
  const { publicKey } = useAuth();
  const { data } = useProfile(publicKey || undefined);
  return data;
}

export interface ProfileUpdate {
  name: string;
  bio: string;
  avatarRef: string;
  bannerRef?: string;
  links: ProfileLink[];
  /** Verified attestation to preserve across edits (empty string clears it). */
  vfy?: string;
  /** Pinned post ids to preserve/update across edits. */
  pins?: string[];
  /** Monthly subscription price in XRGE (0 disables creator subscriptions). */
  subPrice?: number;
}

/** Publishes a `profile`-type post that becomes the user's current profile. */
export function useUpdateProfile() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (update: ProfileUpdate) => {
      if (!wallet) throw new Error("Locked");
      const body = encodeProfile({
        name: update.name.trim() || undefined,
        bio: update.bio.trim() || undefined,
        avatar: update.avatarRef || undefined,
        banner: update.bannerRef || undefined,
        links: update.links.length ? update.links : undefined,
        vfy: update.vfy || undefined,
        pins: update.pins?.length ? update.pins : undefined,
        sub: update.subPrice && update.subPrice > 0 ? update.subPrice : undefined,
      });
      const res = await write.createPost({ wallet, publicKey, isExtensionWallet }, body);
      if (!res.success) throw new Error(res.error || "Failed to save profile");
      return res;
    },
    onSuccess: () => {
      invalidateProfile(publicKey);
      client.invalidateQueries({ queryKey: ["profile", publicKey] });
      invalidateFeeds(client, publicKey);
    },
  });
}

/**
 * Pin / unpin your own posts (max PINNED_MAX). Pins live in the profile envelope,
 * so a change re-publishes the profile — preserving its other fields. Editing
 * requires your current profile to be loaded (useMyProfile).
 */
export function usePinPost() {
  const me = useMyProfile();
  const update = useUpdateProfile();
  const pins = me?.pins ?? [];

  const save = async (next: string[]) => {
    if (!me) throw new Error("Your profile isn't loaded yet — try again in a moment.");
    await update.mutateAsync({
      name: me.name,
      bio: me.bio,
      avatarRef: me.avatarRef,
      bannerRef: me.bannerRef,
      links: me.links,
      vfy: me.vfy,
      pins: next,
      subPrice: me.subPrice,
    });
  };

  return {
    pins,
    busy: update.isPending,
    isPinned: (postId: string) => pins.includes(postId),
    pin: async (postId: string) => {
      if (pins.includes(postId)) return;
      if (pins.length >= PINNED_MAX) {
        throw new Error(`You can pin up to ${PINNED_MAX} posts — unpin one first.`);
      }
      await save([postId, ...pins]); // newest pin shown first
    },
    unpin: async (postId: string) => {
      if (!pins.includes(postId)) return;
      await save(pins.filter((id) => id !== postId));
    },
  };
}
