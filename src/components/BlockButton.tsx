import { useState } from "react";
import { Ban } from "lucide-react";
import { useDmGate } from "@/hooks/useMessenger";
import { useToast } from "./Toast";
import { cn } from "@/lib/utils";

/**
 * Block / unblock an account from their profile.
 *
 * There is no on-chain block, so this is a local (per-account, per-device) hide:
 * it keeps their DMs out of your inbox. It does not stop them following you or
 * seeing your public posts — the confirm copy says so rather than implying more.
 */
export default function BlockButton({ pubkey }: { pubkey: string }) {
  const gate = useDmGate();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const blocked = gate.blocked.has(pubkey);

  function toggle() {
    if (blocked) {
      gate.unblock(pubkey);
      toast("Unblocked", "success");
      return;
    }
    setConfirm(true);
  }

  return (
    <>
      <button
        className={cn(
          "flex h-10 w-11 shrink-0 items-center justify-center p-0",
          blocked ? "btn-primary" : "btn-soft",
        )}
        onClick={toggle}
        aria-label={blocked ? "Unblock account" : "Block account"}
        title={blocked ? "Unblock" : "Block"}
      >
        <Ban className="h-4 w-4" />
      </button>

      {confirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setConfirm(false)}
        >
          <div
            className="w-full max-w-xs rounded-2xl border border-ink-border bg-ink-card p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Block this account?</h3>
            <p className="mt-1.5 text-sm text-ink-muted">
              Their messages stop showing up in your inbox on this device. They can
              still see your public posts. You can undo this any time.
            </p>
            <div className="mt-4 flex gap-2">
              <button className="btn-soft flex-1 py-2.5" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button
                className="btn-primary flex-1 py-2.5"
                onClick={() => {
                  gate.block(pubkey);
                  setConfirm(false);
                  toast("Blocked", "success");
                }}
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
