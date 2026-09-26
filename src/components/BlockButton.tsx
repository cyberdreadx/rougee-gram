import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const gate = useDmGate();
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const blocked = gate.blocked.has(pubkey);

  function toggle() {
    if (blocked) {
      gate.unblock(pubkey);
      toast(t("block.unblocked"), "success");
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
        aria-label={blocked ? t("block.unblockAccount") : t("block.blockAccount")}
        title={blocked ? t("block.unblock") : t("block.block")}
      >
        <Ban className="h-4 w-4" />
      </button>

      {confirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-6"
          onClick={() => setConfirm(false)}
        >
          <div
            className="glass w-full max-w-xs rounded-2xl p-5 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">{t("block.confirmTitle")}</h3>
            <p className="mt-1.5 text-sm text-ink-muted">
              {t("block.confirmBody")}
            </p>
            <div className="mt-4 flex gap-2">
              <button className="btn-soft flex-1 py-2.5" onClick={() => setConfirm(false)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn-primary flex-1 py-2.5"
                onClick={() => {
                  gate.block(pubkey);
                  setConfirm(false);
                  toast(t("block.blocked"), "success");
                }}
              >
                {t("block.block")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
