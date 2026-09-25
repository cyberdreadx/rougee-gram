import { useQuery } from "@tanstack/react-query";
import { getXrgeBalance } from "@/lib/rouge";
import { getAttestation } from "@/lib/verifyApi";
import { isValidAttestation, VERIFY_MIN_XRGE } from "@/lib/verify";

/**
 * Whether an account currently shows the verified badge: a valid HQ attestation
 * AND a live balance ≥ VERIFY_MIN_XRGE. The attestation is stored by the verify
 * Worker (an ML-DSA-65 signature is too large for the on-chain profile body), so
 * we fetch it and validate it locally against the HQ public key. The balance
 * re-check means dropping below the threshold hides the badge with no revocation.
 */
export function useVerified(pubkey: string | undefined): boolean {
  const { data: vfy } = useQuery({
    queryKey: ["attestation", pubkey],
    enabled: !!pubkey,
    staleTime: 10 * 60_000,
    queryFn: () => getAttestation(pubkey as string),
  });
  const attested = !!pubkey && isValidAttestation(pubkey, vfy ?? undefined);

  const { data: balance } = useQuery({
    queryKey: ["verify-balance", pubkey],
    enabled: attested && !!pubkey,
    staleTime: 5 * 60_000,
    queryFn: () => getXrgeBalance(pubkey as string),
  });

  return attested && (balance ?? 0) >= VERIFY_MIN_XRGE;
}
