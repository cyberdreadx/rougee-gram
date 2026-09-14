import { useEffect, useState } from "react";
import { Loader2, Lock, ChevronDown, Plus } from "lucide-react";
import { useAuth, getLastAddress } from "@/store/auth";
import { useToast } from "@/components/Toast";
import Logo from "@/components/Logo";
import Avatar from "@/components/Avatar";
import { shortAddress } from "@/lib/format";
import Onboarding from "./Onboarding";

export default function Unlock() {
  const { wallets, unlock } = useAuth();
  const { toast } = useToast();
  const [selected, setSelected] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [addNew, setAddNew] = useState(false);

  useEffect(() => {
    const last = getLastAddress();
    const exists = wallets.some((w) => w.address === last);
    setSelected(exists ? last : wallets[0]?.address ?? "");
  }, [wallets]);

  if (addNew) return <Onboarding />;

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await unlock(selected, password);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Unlock failed.", "error");
      setBusy(false);
    }
  }

  const active = wallets.find((w) => w.address === selected);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size={44} withWordmark />
        </div>

        <div className="card p-6">
          <h1 className="mb-1 text-xl font-bold">Welcome back</h1>
          <p className="mb-5 text-sm text-ink-muted">
            Unlock your account to continue.
          </p>

          {/* Account picker */}
          <div className="relative mb-4">
            <button
              type="button"
              onClick={() => setShowPicker((s) => !s)}
              className="flex w-full items-center gap-3 rounded-xl border border-ink-border bg-ink-soft px-3 py-2.5 text-left"
            >
              <Avatar seed={active?.address ?? ""} size={34} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {shortAddress(active?.address ?? "")}
                </div>
                <div className="text-xs text-ink-muted">RougeChain account</div>
              </div>
              {wallets.length > 1 && (
                <ChevronDown className="h-4 w-4 text-ink-muted" />
              )}
            </button>

            {showPicker && wallets.length > 1 && (
              <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-ink-border bg-ink-card shadow-xl">
                {wallets.map((w) => (
                  <button
                    key={w.address}
                    type="button"
                    onClick={() => {
                      setSelected(w.address);
                      setShowPicker(false);
                    }}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5"
                  >
                    <Avatar seed={w.address} size={30} />
                    <span className="truncate text-sm">
                      {shortAddress(w.address)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={handleUnlock} className="space-y-3">
            <input
              type="password"
              className="input"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              className="btn-primary w-full py-3"
              disabled={busy || !selected || !password}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Lock className="h-4 w-4" /> Unlock
                </>
              )}
            </button>
          </form>
        </div>

        <button
          className="btn-ghost mt-4 w-full"
          onClick={() => setAddNew(true)}
        >
          <Plus className="h-4 w-4" /> Create or import another account
        </button>
      </div>
    </div>
  );
}
