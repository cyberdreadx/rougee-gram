import { useQuery } from "@tanstack/react-query";
import { rc } from "@/lib/rouge";

/**
 * Resolve a rouge1… address (or hex pubkey) to a full public key via the
 * on-chain index. A known pubkey (passed via router state) short-circuits the
 * network call.
 */
export function useResolvePubkey(
  input: string | undefined,
  knownPubkey?: string,
) {
  return useQuery({
    queryKey: ["resolve", input],
    enabled: Boolean(input) && !knownPubkey,
    initialData: knownPubkey
      ? ({ publicKey: knownPubkey } as { publicKey: string })
      : undefined,
    queryFn: async () => {
      const res = await rc().resolveAddress(input as string);
      return { publicKey: (res as { publicKey?: string }).publicKey ?? "" };
    },
    staleTime: Infinity,
  });
}
