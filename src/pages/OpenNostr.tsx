import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { nip19 } from "nostr-tools";
import { Loader2 } from "lucide-react";

/**
 * Opens any NIP-19 entity (npub / nprofile / note / nevent, or a raw hex id)
 * inside Rougee. This is the URL other Nostr clients use via the NIP-89
 * handler (https://rougee.app/open/<bech32>).
 */
export default function OpenNostr() {
  const { entity = "" } = useParams<{ entity: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    const raw = decodeURIComponent(entity).replace(/^nostr:/i, "").trim();
    let to: string | null = null;
    try {
      if (/^[0-9a-f]{64}$/i.test(raw)) to = `/n/${raw.toLowerCase()}`;
      else {
        const d = nip19.decode(raw);
        if (d.type === "npub") to = `/nostr/${d.data}`;
        else if (d.type === "nprofile") to = `/nostr/${d.data.pubkey}`;
        else if (d.type === "note") to = `/n/${d.data}`;
        else if (d.type === "nevent") to = `/n/${d.data.id}`;
      }
    } catch {
      /* not a NIP-19 entity */
    }
    if (to) navigate(to, { replace: true });
    else window.location.replace(`https://njump.me/${encodeURIComponent(raw)}`);
  }, [entity, navigate]);

  return (
    <div className="flex justify-center py-24">
      <Loader2 className="h-5 w-5 animate-spin text-ink-muted" />
    </div>
  );
}
