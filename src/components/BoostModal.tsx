import { useState } from "react";
import { Rocket, Loader2 } from "lucide-react";
import { useBoostPost } from "@/hooks/usePromote";
import { useAuth } from "@/store/auth";
import { useToast } from "./Toast";
import Modal from "./Modal";
import { formatCount } from "@/lib/format";
import { cn } from "@/lib/utils";

const AMOUNTS = [50, 100, 500, 1000];
const DURATIONS = [
  { label: "24 hours", hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "7 days", hours: 168 },
];
const FEE = 1; // XRGE network fee

/**
 * Boost a post: pay XRGE into the ad reward pool. The post is shown as
 * "Sponsored" in feeds, and viewers who see it earn a slice of your spend.
 */
export default function BoostModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const { balance, refreshBalance } = useAuth();
  const { toast } = useToast();
  const boost = useBoostPost();
  const [amount, setAmount] = useState(100);
  const [hours, setHours] = useState(24);

  const insufficient = amount + FEE > balance;
  const canBoost = amount > 0 && !insufficient && !boost.isPending;

  function submit() {
    boost.mutate(
      { postId, amount, durationHours: hours },
      {
        onSuccess: () => {
          toast(`Boosted for ${formatCount(amount)} XRGE 🚀`, "success");
          refreshBalance();
          onClose();
        },
        onError: (e) => toast(e instanceof Error ? e.message : "Boost failed", "error"),
      },
    );
  }

  return (
    <Modal onClose={boost.isPending ? () => {} : onClose} title="Boost this post">
      <p className="text-sm text-ink-muted">
        Promote this post across RouGee. Most of your spend becomes a reward pool —
        people who view it earn XRGE, so you reach real, paid-attention viewers.
      </p>

      <label className="label mt-4">Budget (XRGE)</label>
      <div className="grid grid-cols-4 gap-2">
        {AMOUNTS.map((v) => (
          <button
            key={v}
            onClick={() => setAmount(v)}
            disabled={boost.isPending}
            className={cn(
              "rounded-xl py-2.5 text-sm font-semibold transition-colors disabled:opacity-50",
              amount === v ? "bg-rouge-600 text-white" : "bg-ink-soft text-white hover:bg-white/10",
            )}
          >
            {formatCount(v)}
          </button>
        ))}
      </div>
      <input
        type="number"
        min={1}
        inputMode="numeric"
        className="input mt-2"
        value={amount || ""}
        onChange={(e) => setAmount(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        disabled={boost.isPending}
      />

      <label className="label mt-4">Duration</label>
      <div className="grid grid-cols-3 gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d.hours}
            onClick={() => setHours(d.hours)}
            disabled={boost.isPending}
            className={cn(
              "rounded-xl py-2.5 text-sm font-medium transition-colors disabled:opacity-50",
              hours === d.hours ? "bg-rouge-600 text-white" : "bg-ink-soft text-ink-muted hover:text-white",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-ink-muted">
          Balance: {formatCount(balance)} XRGE · fee {FEE}
        </span>
        {insufficient && <span className="text-rouge-400">Insufficient balance</span>}
      </div>

      <button className="btn-primary mt-4 w-full py-3" onClick={submit} disabled={!canBoost}>
        {boost.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Rocket className="h-4 w-4" /> Boost for {formatCount(amount)} XRGE
          </>
        )}
      </button>
      <p className="mt-2 text-[11px] text-ink-muted">
        Longer duration &amp; bigger budget get more placement. ~85% funds viewer
        rewards; the rest supports RouGee.
      </p>
    </Modal>
  );
}
