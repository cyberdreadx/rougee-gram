import { useTranslation } from "react-i18next";
import { useTrackArtist } from "@/hooks/useSounds";
import TipButton from "./TipButton";

/**
 * "Tip artist" control for a reel's attached sound. Resolves the track's payable
 * artist (qRougee NFT royalty recipient / creator) and renders a tip pill.
 * Renders nothing when the track has no id, no resolvable artist address, or the
 * artist is the signed-in user (TipButton handles the self/empty cases).
 */
export default function TrackTip({
  trackId,
  artistName,
  className,
}: {
  trackId?: string;
  artistName?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const { data } = useTrackArtist(trackId);
  if (!data?.address) return null;
  return (
    <TipButton
      variant="pill"
      toAddress={data.address}
      toName={artistName || data.name || t("tip.theArtist")}
      label={t("tip.tipArtist")}
      className={className}
    />
  );
}
