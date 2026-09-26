import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  Plug,
  Info,
} from "lucide-react";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import { getConfig } from "@/lib/config";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";

type View = "welcome" | "create" | "backup" | "import-mnemonic" | "import-keys";

export default function Onboarding() {
  const {
    createWallet,
    finalizeOnboarding,
    importMnemonic,
    importKeys,
    connectExtension,
    extensionDetected,
    host,
  } = useAuth();
  const { t } = useTranslation();
  const isQwalla = host === "qwalla";
  const walletName = isQwalla ? t("onboarding.qwalla") : t("onboarding.extension");
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
    if (password.length < 8) return t("onboarding.pwMin8");
    if (password !== confirm) return t("onboarding.pwMismatch");
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
      toast(e instanceof Error ? e.message : t("onboarding.createFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportMnemonic() {
    const err = validatePw();
    if (err) return toast(err, "error");
    const words = importPhrase.trim().split(/\s+/).length;
    if (words !== 12 && words !== 24) {
      return toast(t("onboarding.enterPhrase"), "error");
    }
    setBusy(true);
    try {
      await importMnemonic(importPhrase, password);
      toast(t("onboarding.imported"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("onboarding.importFailed"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleImportKeys() {
    const err = validatePw();
    if (err) return toast(err, "error");
    if (!pubKey.trim() || !privKey.trim()) {
      return toast(t("onboarding.keysRequired"), "error");
    }
    setBusy(true);
    try {
      await importKeys(pubKey, privKey, password);
      toast(t("onboarding.imported"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : t("onboarding.importFailed"), "error");
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
              {t("onboarding.heroTitle")}
            </h1>
            <p className="max-w-sm text-ink-muted">
              {t("onboarding.heroBody")}
            </p>
            <ul className="space-y-3 text-sm">
              <Feature icon={<KeyRound className="h-4 w-4" />}>
                {t("onboarding.feat1")}
              </Feature>
              <Feature icon={<ShieldCheck className="h-4 w-4" />}>
                {t("onboarding.feat2")}
              </Feature>
              <Feature icon={<Sparkles className="h-4 w-4" />}>
                {t("onboarding.feat3")}
              </Feature>
            </ul>
          </div>
          <p className="relative z-10 text-xs text-ink-muted">
            {t("onboarding.connectedTo", { net })}
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
                <h2 className="text-2xl font-bold">{t("onboarding.welcome")}</h2>
                <p className="text-sm text-ink-muted">
                  {t("onboarding.welcomeBody")}
                </p>
                {extensionDetected && (
                  <button
                    className={cn(
                      "w-full justify-center gap-2 py-3",
                      isQwalla ? "btn-primary" : "btn-soft",
                    )}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await connectExtension();
                      } catch (e) {
                        toast(
                          e instanceof Error
                            ? e.message
                            : t("onboarding.connectFailed", { wallet: walletName }),
                          "error",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                    disabled={busy}
                  >
                    <Plug className="h-4 w-4" />{" "}
                    {isQwalla ? t("onboarding.continueQwalla") : t("onboarding.connectExtension")}
                  </button>
                )}
                <button
                  className="btn-primary w-full py-3"
                  onClick={() => setView("create")}
                >
                  {t("onboarding.createAccount")}
                </button>
                <button
                  className="btn-soft w-full py-3"
                  onClick={() => setView("import-mnemonic")}
                >
                  {t("onboarding.havePhrase")}
                </button>
                <button
                  className="btn-ghost w-full"
                  onClick={() => setView("import-keys")}
                >
                  {t("onboarding.importRawKeys")}
                </button>
                <div className="flex items-start gap-2 rounded-xl bg-ink-soft px-3 py-2.5 text-xs text-ink-muted">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rouge-400" />
                  <span>{t("onboarding.clearedNote")}</span>
                </div>
                {extensionDetected && (
                  <p className="text-center text-xs text-ink-muted">
                    {t("onboarding.custodyNote", { wallet: walletName })}
                  </p>
                )}
              </div>
            )}

            {view === "create" && (
              <div className="animate-fade-in space-y-4">
                <BackButton onClick={() => setView("welcome")} />
                <h2 className="text-2xl font-bold">{t("onboarding.setPassword")}</h2>
                <p className="text-sm text-ink-muted">
                  {t("onboarding.setPasswordBody")}
                </p>
                <PasswordFields
                  {...{ password, setPassword, confirm, setConfirm, showPw, setShowPw }}
                />
                <button
                  className="btn-primary w-full py-3"
                  onClick={handleCreate}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("onboarding.createAccountBtn")}
                </button>
              </div>
            )}

            {view === "backup" && (
              <div className="animate-fade-in space-y-4">
                <h2 className="text-2xl font-bold">{t("onboarding.savePhrase")}</h2>
                <p className="text-sm text-ink-muted">
                  {t("onboarding.savePhraseBody")}
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
                      <Check className="h-4 w-4" /> {t("onboarding.copied")}
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" /> {t("onboarding.copyPhrase")}
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
                  {t("onboarding.savedConfirm")}
                </label>
                <button
                  className="btn-primary w-full py-3"
                  disabled={!savedConfirmed}
                  onClick={() => {
                    finalizeOnboarding();
                    toast(t("onboarding.welcomeToast"), "success");
                  }}
                >
                  {t("onboarding.enterRouge")}
                </button>
              </div>
            )}

            {view === "import-mnemonic" && (
              <div className="animate-fade-in space-y-4">
                <BackButton onClick={() => setView("welcome")} />
                <h2 className="text-2xl font-bold">{t("onboarding.recoveryPhrase")}</h2>
                <textarea
                  className="input h-24 resize-none font-mono"
                  placeholder={t("onboarding.phrasePlaceholder")}
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
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("onboarding.importAccount")}
                </button>
              </div>
            )}

            {view === "import-keys" && (
              <div className="animate-fade-in space-y-4">
                <BackButton onClick={() => setView("welcome")} />
                <h2 className="text-2xl font-bold">{t("onboarding.importRawKeysTitle")}</h2>
                <div>
                  <label className="label">{t("onboarding.publicKeyHex")}</label>
                  <textarea
                    className="input h-16 resize-none font-mono text-xs"
                    value={pubKey}
                    onChange={(e) => setPubKey(e.target.value)}
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className="label">{t("onboarding.privateKeyHex")}</label>
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
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : t("onboarding.importAccount")}
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
  const { t } = useTranslation();
  return (
    <button className="btn-ghost -ml-2 h-8 px-2 text-sm" onClick={onClick}>
      <ArrowLeft className="h-4 w-4" /> {t("onboarding.back")}
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
  const { t } = useTranslation();
  const { password, setPassword, confirm, setConfirm, showPw, setShowPw } = props;
  return (
    <div className="space-y-3">
      <div className="relative">
        <input
          type={showPw ? "text" : "password"}
          className="input pr-10"
          placeholder={t("onboarding.pwPlaceholder")}
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
        placeholder={t("onboarding.confirmPwPlaceholder")}
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
    </div>
  );
}
