import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getProfile, invalidateProfile, type Profile } from "@/lib/profile";
import { useAuth } from "@/store/auth";
import { encodeProfile } from "@/lib/envelope";
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
