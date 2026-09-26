import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SocialPost } from "@rougechain/sdk";
import { useAuth } from "@/store/auth";
import { rc, resolveTxId } from "@/lib/rouge";
import { isAdPost } from "@/lib/envelope";
import * as write from "@/lib/write";
import {
  getPoolAddress,
  recordBoost,
  getPromoted,
  getEarnings,
  claimEarnings,
  promoteEnabled,
} from "@/lib/promote";

/** Boost a post: pay XRGE to the ad-pool, then register the boost (verified
 *  on-chain by the worker). */
export function useBoostPost() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      postId,
      amount,
      durationHours,
    }: {
      postId: string;
      amount: number;
      durationHours: number;
    }) => {
      if (!wallet) throw new Error("Locked");
      if (!(amount > 0)) throw new Error("Enter an amount");
      const pool = await getPoolAddress();
      if (!pool) throw new Error("Promotion isn't available right now.");
      const res = await write.tip({ wallet, publicKey, isExtensionWallet }, pool, amount);
      if (!res.success) throw new Error(res.error || "Payment failed");
      const txId = await resolveTxId(res, publicKey);
      if (!txId) {
        throw new Error("Paid, but couldn't confirm the transaction yet. Try boosting again shortly.");
      }
      const boost = await recordBoost(postId, txId, durationHours);
      if (!boost.ok) throw new Error(boost.error || "Boost couldn't be registered.");
      return boost;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["promoted"] }),
  });
}

/** Active promoted posts (for feed injection). */
export function usePromoted() {
  return useQuery({
    queryKey: ["promoted"],
    enabled: promoteEnabled(),
    staleTime: 2 * 60_000,
    queryFn: getPromoted,
  });
}

/** Promoted posts resolved to full SocialPosts, for feed injection. */
export function useSponsoredPosts() {
  const { data: ads } = usePromoted();
  const ids = (ads ?? []).map((a) => a.postId);
  return useQuery({
    queryKey: ["sponsoredPosts", ids.join(",")],
    enabled: ids.length > 0,
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<SocialPost[]> => {
      const posts = await Promise.all(
        ids.map((id) =>
          rc()
            .social.getPost(id)
            .then((r) => r?.post ?? null)
            .catch(() => null),
        ),
      );
      return posts.filter((p): p is SocialPost => !!p);
    },
  });
}

/**
 * The signed-in user's own ad "dark posts" — including ones never funded.
 * These are filtered out of every organic surface, so this is the only place
 * an author can see and (re-)boost them.
 */
export function useMyAds() {
  const { publicKey } = useAuth();
  return useQuery({
    queryKey: ["myAds", publicKey],
    enabled: !!publicKey && promoteEnabled(),
    staleTime: 60_000,
    queryFn: async (): Promise<SocialPost[]> => {
      const r = await rc().social.getUserPosts(publicKey, 100, 0);
      return ((r?.posts ?? []) as SocialPost[]).filter((p) => isAdPost(p));
    },
  });
}

/** The signed-in user's accrued ad-view earnings. */
export function useEarnings() {
  const { publicKey } = useAuth();
  return useQuery({
    queryKey: ["earnings", publicKey],
    enabled: !!publicKey && promoteEnabled(),
    staleTime: 60_000,
    queryFn: () => getEarnings(publicKey),
  });
}

export function useClaimEarnings() {
  const { publicKey } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const r = await claimEarnings(publicKey);
      if (!r.ok) throw new Error(r.error || "Claim failed");
      return r;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["earnings", publicKey] }),
  });
}
