import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import {
  getSubStatus,
  listSubscriptions,
  recordSubscription,
  subsEnabled,
} from "@/lib/subs";
import * as write from "@/lib/write";
import { resolveTxId } from "@/lib/rouge";

/** Whether the viewer has an active subscription to `creator`. */
export function useSubStatus(creator: string | undefined) {
  const { publicKey } = useAuth();
  return useQuery({
    queryKey: ["subStatus", creator, publicKey],
    enabled: subsEnabled() && Boolean(creator && publicKey && creator !== publicKey),
    staleTime: 60_000,
    queryFn: () => getSubStatus(creator as string, publicKey),
  });
}

/** The viewer's active subscriptions (for a management screen). */
export function useMySubscriptions() {
  const { publicKey } = useAuth();
  return useQuery({
    queryKey: ["mySubs", publicKey],
    enabled: subsEnabled() && Boolean(publicKey),
    staleTime: 60_000,
    queryFn: () => listSubscriptions(publicKey),
  });
}

/**
 * Subscribe to a creator: pay their monthly price in XRGE (on-chain transfer),
 * then record it with the Worker, which re-verifies the transfer and grants 30
 * days. `address` is the creator's rouge address (transfer target); `creator` is
 * their pubkey (what the Worker keys the subscription by).
 */
export function useSubscribe() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      creator,
      address,
      price,
    }: {
      creator: string;
      address: string;
      price: number;
    }) => {
      if (!wallet) throw new Error("Unlock your wallet first.");
      if (!(price > 0)) throw new Error("This creator hasn't set a price.");
      if (!address) throw new Error("Creator address unavailable.");
      const res = await write.tip({ wallet, publicKey, isExtensionWallet }, address, price);
      if (!res.success) throw new Error(res.error || "Payment failed");
      const txId = await resolveTxId(res, publicKey);
      if (!txId) {
        throw new Error("Payment sent, but couldn't confirm it yet — try subscribing again shortly.");
      }
      return recordSubscription(creator, txId);
    },
    onSuccess: (_d, vars) => {
      client.invalidateQueries({ queryKey: ["subStatus", vars.creator, publicKey] });
      client.invalidateQueries({ queryKey: ["mySubs", publicKey] });
    },
  });
}
