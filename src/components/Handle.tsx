import { useUsername } from "@/hooks/useUsername";
import { cn } from "@/lib/utils";

/**
 * Renders a wallet's on-chain @username when it has one, else nothing. Distinct
 * from the free-text display name — this is the unique handle from the name
 * registry. Keep it subtle (muted) so it reads as a secondary identifier.
 */
export default function Handle({
  pubkey,
  className,
}: {
  pubkey: string | undefined;
  className?: string;
}) {
  const { data: name } = useUsername(pubkey);
  if (!name) return null;
  return <span className={cn("text-ink-muted", className)}>@{name}</span>;
}
