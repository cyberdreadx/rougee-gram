import { useState } from "react";
import {
  ShieldCheck,
  KeyRound,
  Copy,
  Check,
  Loader2,
  ArrowLeft,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import { getConfig } from "@/lib/config";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";

type View = "welcome" | "create" | "backup" | "import-mnemonic" | "import-keys";

export default function Onboarding() {
  const { createWallet, finalizeOnboarding, importMnemonic, importKeys } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState<View>("welcome");
  const [busy, setBusy] = useState(false);

  // shared form state
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [mnemonic, setMnemonic] = useState("");
  const [importPhrase, setImportPhrase] = useState("");
  const [pubKey, setPubKey] = useState("");
  const [privKey, setPrivKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [savedConfirmed, setSavedConfirmed] = useState(false);

  const net = getConfig().network;

  function validatePw(): string | null {
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords don't match.";
    return null;
  }

  async function handleCreate() {
    const err = validatePw();
    if (err) return toast(err, "error");
    setBusy(true);
    try {
      const { mnemonic: m } = await createWallet(password);
      setMnemonic(m);
      setView("backup");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to create wallet.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportMnemonic() {
    const err = validatePw();
    if (err) return toast(err, "error");
    const words = importPhrase.trim().split(/\s+/).length;
    if (words !== 12 && words !== 24) {
      return toast("Enter a 12 or 24-word recovery phrase.", "error");
    }
    setBusy(true);
    try {
      await importMnemonic(importPhrase, password);
      toast("Wallet imported.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportKeys() {
    const err = validatePw();
    if (err) return toast(err, "error");
    if (!pubKey.trim() || !privKey.trim()) {
      return toast("Both public and private keys are required.", "error");
    }
    setBusy(true);
    try {
      await importKeys(pubKey, privKey, password);
      toast("Wallet imported.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  function copyMnemonic() {
    navigator.clipboard.writeText(mnemonic).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto grid min-h-screen max-w-5xl grid-cols-1 md:grid-cols-2">
        {/* Left: pitch */}
        <div className="relative hidden flex-col justify-between overflow-hidden p-10 md:flex">
          <div className="absolute -left-24 -top-24 h-72 w-72 rounded-full bg-rouge-600/20 blur-3xl" />
          <div className="absolute -bottom-24 left-10 h-72 w-72 rounded-full bg-rouge-500/10 blur-3xl" />
          <Logo size={40} withWordmark />
          <div className="relative z-10 space-y-6">
            <h1 className="text-4xl font-bold leading-tight tracking-tight">
              Photos nobody can{" "}
              <span className="brand-text">take away</span> from you.
            </h1>
            <p className="max-w-sm text-ink-muted">
              Rougee-gram is a photo network on RougeChain — a post-quantum
              blockchain. Your account is a cryptographic key you hold, not a row
              in someone's database. No shadowbans. No disabled accounts. No
              gatekeeper.
            </p>
            <ul className="space-y-3 text-sm">
              <Feature icon={<KeyRound className="h-4 w-4" />}>
                You own your identity — a key, not an email/phone.
              </Feature>
              <Feature icon={<ShieldCheck className="h-4 w-4" />}>
                Posts, likes &amp; follows live on-chain, signed by you.
              </Feature>
              <Feature icon={<Sparkles className="h-4 w-4" />}>
                Photos are content-addressed on IPFS — no silent takedowns.
              </Feature>
            </ul>
          </div>
          <p className="relative z-10 text-xs text-ink-muted">
            Connected to <span className="text-rouge-400">{net}</span>
          </p>
        </div>

        {/* Right: forms */}
        <div className="flex items-center justify-center p-6 md:p-10">
          <div className="w-full max-w-sm">
            <div className="mb-8 md:hidden">
              <Logo size={36} withWordmark />
            </div>

            {view === "welcome" && (
              <div className="animate-fade-in space-y-4">
                <h2 className="text-2xl font-bold">Welcome</h2>
                <p className="text-sm text-ink-muted">
                  Create an account in seconds. No sign-up form, no verification —
                  just a key that's yours.
                </p>
                <button
                  className="btn-primary w-full py-3"
                  onClick={() => setView("create")}
                >
                  Create new account
                </button>
                <button
                  className="btn-soft w-full py-3"
                  onClick={() => setView("import-mnemonic")}
                >
                  I already have a recovery phrase
                </button>
                <button
                  className="btn-ghost w-full"
                  onClick={() => setView("import-keys")}
                >
                  Import with raw keys
                </button>
              </div>
            )}

            {view === "create" && (
              <div className="animate-fade-in space-y-4">
                <BackButton onClick={() => setView("welcome")} />
                <h2 className="text-2xl font-bold">Set a password</h2>
                <p className="text-sm text-ink-muted">
                  This encrypts your key on this device. We never see it, and it
                  can't be reset — so remember it.
                </p>
                <PasswordFields
                  {...{ password, setPassword, confirm, setConfirm, showPw, setShowPw }}
                />
                <button
                  className="btn-primary w-full py-3"
                  onClick={handleCreate}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
                </button>
              </div>
            )}

            {view === "backup" && (
              <div className="animate-fade-in space-y-4">
                <h2 className="text-2xl font-bold">Save your recovery phrase</h2>
                <p className="text-sm text-ink-muted">
                  These 24 words are the <b>only</b> way to recover your account
                  on another device. Write them down and keep them offline. Anyone
                  with them controls your account.
                </p>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-ink-border bg-ink-soft p-3 text-sm sm:grid-cols-3">
                  {mnemonic.split(/\s+/).map((word, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-right text-xs text-ink-muted">
                        {i + 1}
                      </span>
                      <span className="font-mono">{word}</span>
                    </div>
                  ))}
                </div>
                <button className="btn-soft w-full" onClick={copyMnemonic}>
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> Copy phrase
                    </>
                  )}
                </button>
                <label className="flex items-start gap-2.5 text-sm text-ink-muted">
                  <input
                    type="checkbox"
                    checked={savedConfirmed}
                    onChange={(e) => setSavedConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-rouge-600"
                  />
                  I've saved my recovery phrase somewhere safe.
                </label>
                <button
                  className="btn-primary w-full py-3"
                  disabled={!savedConfirmed}
                  onClick={() => {
                    finalizeOnboarding();
                    toast("Welcome to Rougee-gram!", "success");
                  }}
                >
                  Enter Rougee-gram
                </button>
              </div>
            )}

            {view === "import-mnemonic" && (
              <div className="animate-fade-in space-y-4">
                <BackButton onClick={() => setView("welcome")} />
                <h2 className="text-2xl font-bold">Recovery phrase</h2>
                <textarea
                  className="input h-24 resize-none font-mono"
                  placeholder="Enter your 12 or 24-word phrase, separated by spaces"
                  value={importPhrase}
                  onChange={(e) => setImportPhrase(e.target.value)}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                <PasswordFields
                  {...{ password, setPassword, confirm, setConfirm, showPw, setShowPw }}
                />
                <button
                  className="btn-primary w-full py-3"
                  onClick={handleImportMnemonic}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import account"}
                </button>
              </div>
            )}

            {view === "import-keys" && (
              <div className="animate-fade-in space-y-4">
                <BackButton onClick={() => setView("welcome")} />
                <h2 className="text-2xl font-bold">Import raw keys</h2>
                <div>
                  <label className="label">Public key (hex)</label>
                  <textarea
                    className="input h-16 resize-none font-mono text-xs"
                    value={pubKey}
                    onChange={(e) => setPubKey(e.target.value)}
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className="label">Private key (hex)</label>
                  <textarea
                    className="input h-16 resize-none font-mono text-xs"
                    value={privKey}
                    onChange={(e) => setPrivKey(e.target.value)}
                    spellCheck={false}
                  />
                </div>
                <PasswordFields
                  {...{ password, setPassword, confirm, setConfirm, showPw, setShowPw }}
                />
                <button
                  className="btn-primary w-full py-3"
                  onClick={handleImportKeys}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import account"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 text-ink-muted">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rouge-600/15 text-rouge-400">
        {icon}
      </span>
      <span>{children}</span>
    </li>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="btn-ghost -ml-2 h-8 px-2 text-sm" onClick={onClick}>
      <ArrowLeft className="h-4 w-4" /> Back
    </button>
  );
}

function PasswordFields(props: {
  password: string;
  setPassword: (v: string) => void;
  confirm: string;
  setConfirm: (v: string) => void;
  showPw: boolean;
  setShowPw: (v: boolean) => void;
}) {
  const { password, setPassword, confirm, setConfirm, showPw, setShowPw } = props;
  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type={showPw ? "text" : "password"}
          className="input pr-10"
          placeholder="Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          type="button"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-white"
          onClick={() => setShowPw(!showPw)}
          tabIndex={-1}
        >
          {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <input
        type={showPw ? "text" : "password"}
        className={cn("input", confirm && confirm !== password && "border-rouge-500/60")}
        placeholder="Confirm password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
    </div>
  );
}
