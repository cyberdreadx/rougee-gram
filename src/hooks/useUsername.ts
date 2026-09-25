import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import {
  reverseUsername,
  registerUsername,
  releaseUsername,
} from "@/lib/username";

const usernameKey = (pubkey: string) => ["username", pubkey] as const;

/** The @handle owned by a public key (null if none). Cached across the app. */
export function useUsername(pubkey: string | undefined) {
  return useQuery({
    queryKey: usernameKey(pubkey ?? ""),
    enabled: Boolean(pubkey),
    staleTime: 5 * 60_000,
    queryFn: () => reverseUsername(pubkey as string),
  });
}

/** The signed-in wallet's own @handle. */
export function useMyUsername() {
  const { publicKey } = useAuth();
  return useUsername(publicKey || undefined);
}

export function useRegisterUsername() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!wallet) throw new Error("Locked");
      const res = await registerUsername({ wallet, publicKey, isExtensionWallet }, name);
      if (!res.success) throw new Error(res.error || "Couldn't claim that username.");
      return res;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: usernameKey(publicKey) });
    },
  });
}

export function useReleaseUsername() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      if (!wallet) throw new Error("Locked");
      const res = await releaseUsername({ wallet, publicKey, isExtensionWallet }, name);
      if (!res.success) throw new Error(res.error || "Couldn't release that username.");
      return res;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: usernameKey(publicKey) });
    },
  });
}
