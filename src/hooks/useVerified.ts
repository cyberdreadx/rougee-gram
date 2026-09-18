import { useQuery } from "@tanstack/react-query";
import { useProfile } from "./useProfile";
import { getXrgeBalance } from "@/lib/rouge";
import { isValidAttestation, VERIFY_MIN_XRGE } from "@/lib/verify";

/**
 * Whether an account currently shows the verified badge: a valid HQ attestation
 * in its profile AND a live balance ≥ VERIFY_MIN_XRGE. The balance re-check means
 * dropping below the threshold hides the badge without any revocation step.
 */
export function useVerified(pubkey: string | undefined): boolean {
  const { data: profile } = useProfile(pubkey);
  const attested = !!pubkey && isValidAttestation(pubkey, profile?.vfy);

  const { data: balance } = useQuery({
    queryKey: ["verify-balance", pubkey],
    enabled: attested && !!pubkey,
    staleTime: 5 * 60_000,
    queryFn: () => getXrgeBalance(pubkey as string),
  });

  return attested && (balance ?? 0) >= VERIFY_MIN_XRGE;
}
