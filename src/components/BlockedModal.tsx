import { ShieldCheck } from "lucide-react";
import { useDmGate } from "@/hooks/useMessenger";
import { useProfile } from "@/hooks/useProfile";
import { displayName } from "@/lib/profile";
import { shortAddress } from "@/lib/format";
import Avatar from "./Avatar";
import Modal from "./Modal";

/** View and unblock accounts you've rejected from message requests. */
export default function BlockedModal({ onClose }: { onClose: () => void }) {
  const gate = useDmGate();
  const list = [...gate.blocked];

  return (
    <Modal onClose={onClose} title="Blocked accounts" maxWidth="max-w-md">
      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink-border text-ink-muted">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <p className="text-sm text-ink-muted">
            No blocked accounts. Rejecting a message request blocks the sender.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((pk) => (
            <BlockedRow key={pk} pubkey={pk} onUnblock={() => gate.unblock(pk)} />
          ))}
        </div>
      )}
    </Modal>
  );
}

function BlockedRow({ pubkey, onUnblock }: { pubkey: string; onUnblock: () => void }) {
  const { data: profile } = useProfile(pubkey);
  const name = profile ? displayName(profile) : shortAddress(pubkey, 8, 4);
  return (
    <div className="flex items-center gap-3">
      <Avatar refUri={profile?.avatarRef} seed={pubkey} name={profile?.name} size={40} />
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm font-semibold">{name}</div>
        <div className="truncate font-mono text-xs text-ink-muted">
          {shortAddress(profile?.address ?? "", 10, 5)}
        </div>
      </div>
      <button
        onClick={onUnblock}
        className="shrink-0 rounded-lg bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
      >
        Unblock
      </button>
    </div>
  );
}
