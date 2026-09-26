import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Coins, Loader2 } from "lucide-react";
import { useTip } from "@/hooks/useSocial";
import { useAuth } from "@/store/auth";
import { useToast } from "./Toast";
import Modal from "./Modal";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS = [1, 5, 10, 50];
const TIP_FEE = 1; // XRGE network fee per transfer

/**
 * Tip a creator XRGE (on-chain value transfer). Renders nothing when the target
 * is the signed-in user or has no resolvable address.
 */
export default function TipButton({
  toAddress,
  toName,
  postId,
  variant = "icon",
  className,
  iconClassName = "h-6 w-6",
}: {
  /** Recipient rouge address. */
  toAddress?: string;
  /** Display name for the recipient (falls back to the address). */
  toName?: string;
  /** When set, the tip is attributed to this post so its total updates. */
  postId?: string;
  variant?: "icon" | "button";
  className?: string;
  iconClassName?: string;
}) {
  const { t } = useTranslation();
  const { address } = useAuth();
  const [open, setOpen] = useState(false);

  if (!toAddress || toAddress === address) return null;

  return (
    <>
      {variant === "icon" ? (
        <button
          onClick={() => setOpen(true)}
          className={cn("text-white transition-transform hover:text-ink-muted active:scale-90", className)}
          aria-label={t("tip.tip")}
        >
          <Coins className={iconClassName} />
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className={cn("btn-soft", className)}>
          <Coins className="h-4 w-4" /> {t("tip.tip")}
        </button>
      )}
      {open && (
        <TipModal
          toAddress={toAddress}
          toName={toName}
          postId={postId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TipModal({
  toAddress,
  toName,
  postId,
  onClose,
}: {
  toAddress: string;
  toName?: string;
  postId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { balance, refreshBalance } = useAuth();
  const { toast } = useToast();
  const tip = useTip();
  const [amount, setAmount] = useState(5);

  const insufficient = amount + TIP_FEE > balance;
  const canSend = amount > 0 && !insufficient && !tip.isPending;

  function send() {
    tip.mutate(
      { to: toAddress, amount, postId },
      {
        onSuccess: () => {
          toast(t("tip.tipped", { amount }), "success");
          refreshBalance();
          onClose();
        },
        onError: (e) => toast(e instanceof Error ? e.message : t("tip.tipFailed"), "error"),
      },
    );
  }

  return (
    <Modal onClose={tip.isPending ? () => {} : onClose} title={t("tip.sendTip")}>
      <p className="text-sm text-ink-muted">
        {t("tip.tipBody", { name: toName || t("tip.thisCreator") })}
      </p>

      {/* Presets */}
      <div className="mt-4 grid grid-cols-4 gap-2">
        {PRESETS.map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            disabled={tip.isPending}
            className={cn(
              "rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50",
              amount === v ? "bg-rouge-600 text-white" : "bg-ink-soft text-white hover:bg-white/10",
            )}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Custom amount */}
      <label className="label mt-4">{t("tip.amount")}</label>
      <input
        type="number"
        min={1}
        inputMode="numeric"
        className="input"
        value={amount || ""}
        onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        disabled={tip.isPending}
      />

      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-ink-muted">
          {t("tip.balanceFee", { balance: formatCount(balance), fee: TIP_FEE })}
        </span>
        {insufficient && <span className="text-rouge-400">{t("tip.insufficient")}</span>}
      </div>

      <button className="btn-primary mt-4 w-full py-3" onClick={send} disabled={!canSend}>
        {tip.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Coins className="h-4 w-4" /> {t("tip.sendAmount", { amount })}
          </>
        )}
      </button>
    </Modal>
  );
}
