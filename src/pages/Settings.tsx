import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Check,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  Trash2,
  Coins,
  Globe,
  HardDrive,
  Cloud,
  ShieldCheck,
  RefreshCw,
  KeyRound,
  Lock,
  AtSign,
} from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { useAuth } from "@/store/auth";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";
import {
  getConfig,
  updateConfig,
  NETWORKS,
  networkIdForUrl,
  type NetworkId,
} from "@/lib/config";
import { testPinataJwt, testCloudflareWorker, activeBackend } from "@/lib/media";
import { requestFaucet } from "@/lib/rouge";
import { rc } from "@/lib/rouge";
import { changePassword } from "@/lib/keystore";
import { clearProfileCache } from "@/lib/profile";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useVerified } from "@/hooks/useVerified";
import VerifiedBadge from "@/components/VerifiedBadge";
import { startVerify, confirmVerify } from "@/lib/verifyApi";
import { VERIFY_MIN_XRGE } from "@/lib/verify";
import { useMyUsername, useRegisterUsername, useReleaseUsername } from "@/hooks/useUsername";
import { useEarnings, useClaimEarnings, useMyAds, usePromoted } from "@/hooks/usePromote";
import { promoteEnabled } from "@/lib/promote";
import { Rocket } from "lucide-react";
import BoostModal from "@/components/BoostModal";
import MediaImage from "@/components/MediaImage";
import { toMediaCells } from "@/components/PhotoGrid";
import { decodeBody } from "@/lib/envelope";
import { validateUsername, normalizeUsername, isUsernameAvailable, USERNAME_MAX } from "@/lib/username";

/** Operator-only sections (media backend config, network switcher) are hidden
 *  from consumers. They show in local dev, or in any build with
 *  VITE_SHOW_ADVANCED="true". The media backend and network are set at deploy
 *  time (VITE_CF_WORKER_URL / VITE_ROUGE_API), so end users never need them. */
const SHOW_ADVANCED =
  import.meta.env.DEV || import.meta.env.VITE_SHOW_ADVANCED === "true";

export default function Settings() {
  const { wallet, address, balance, publicKey, lock, logout, refreshBalance, isExtensionWallet } =
    useAuth();
  const { toast } = useToast();

  return (
    <div className="pb-10">
      <header className="sticky top-[var(--top-bar-h)] z-20 border-b border-ink-border bg-ink/80 px-4 py-3.5 backdrop-blur md:top-0">
        <h1 className="text-base font-semibold">Settings</h1>
      </header>

      <div className="space-y-6 p-4">
        <AccountSection
          address={address}
          balance={balance}
          publicKey={publicKey}
          mnemonic={wallet?.mnemonic}
          privateKey={wallet?.privateKey ?? ""}
          onFaucet={async () => {
            if (!wallet) return;
            const ok = await requestFaucet(wallet);
            toast(ok ? "Faucet sent. Balance updating…" : "Faucet request failed", ok ? "success" : "error");
            setTimeout(refreshBalance, 1500);
          }}
          onRefresh={refreshBalance}
        />

        <UsernameSection />

        <SecuritySection address={address} isExtensionWallet={isExtensionWallet} />

        <VerifySection publicKey={publicKey} balance={balance} />

        <RewardsSection />

        <MyAdsSection />

        {SHOW_ADVANCED ? (
          <>
            <MediaSection />
            <NetworkSection />
          </>
        ) : (
          <ConsumerNetworkBadge />
        )}

        <DangerSection
          address={address}
          onLock={lock}
          onLogout={() => logout(address)}
        />

        <p className="pt-2 text-center text-xs text-ink-muted">
          RouGee · built on RougeChain · your keys, your photos
        </p>
      </div>
    </div>
  );
}

function UsernameSection() {
  const { toast } = useToast();
  const { data: current, isLoading } = useMyUsername();
  const register = useRegisterUsername();
  const release = useReleaseUsername();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "checking" | "available" | "taken" | "invalid">(
    "idle",
  );

  const normalized = normalizeUsername(value);
  const error = value ? validateUsername(value) : null;

  // Debounced availability check as the user types.
  useEffect(() => {
    if (!value) return setStatus("idle");
    if (error) return setStatus("invalid");
    setStatus("checking");
    let active = true;
    const t = setTimeout(async () => {
      const ok = await isUsernameAvailable(normalized);
      if (active) setStatus(ok ? "available" : "taken");
    }, 450);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [value, normalized, error]);

  function claim() {
    register.mutate(normalized, {
      onSuccess: () => {
        toast(`@${normalized} is yours 🎉`, "success");
        setValue("");
        setStatus("idle");
      },
      onError: (e) => toast(e instanceof Error ? e.message : "Couldn't claim it.", "error"),
    });
  }

  function giveUp() {
    if (!current) return;
    release.mutate(current, {
      onSuccess: () => toast("Username released.", "success"),
      onError: (e) => toast(e instanceof Error ? e.message : "Couldn't release it.", "error"),
    });
  }

  return (
    <Section icon={<AtSign className="h-4 w-4" />} title="Username">
      {isLoading ? (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
        </div>
      ) : current ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl bg-ink-soft px-3 py-2.5">
            <span className="font-semibold">@{current}</span>
            <span className="text-xs text-emerald-400">Claimed</span>
          </div>
          <p className="text-xs text-ink-muted">
            Your unique handle on RougeChain — separate from your display name, and
            reserved to your key. People can find you at <span className="font-mono">@{current}</span>.
          </p>
          <button
            className="btn-ghost w-full text-xs text-rouge-400"
            disabled={release.isPending}
            onClick={giveUp}
          >
            {release.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Release username"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-ink-muted">
            Claim a unique <span className="font-medium text-white">@username</span> — a
            permanent handle bound to your key, separate from your display name.
          </p>
          <div className="flex items-center gap-2 rounded-xl bg-ink-soft px-3">
            <span className="text-ink-muted">@</span>
            <input
              className="flex-1 bg-transparent py-2.5 text-sm outline-none"
              placeholder="username"
              value={value}
              maxLength={USERNAME_MAX + 1}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setValue(e.target.value)}
            />
            {status === "checking" && <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />}
            {status === "available" && <Check className="h-4 w-4 text-emerald-400" />}
          </div>
          <div className="min-h-[1rem] text-xs">
            {error ? (
              <span className="text-rouge-400">{error}</span>
            ) : status === "taken" ? (
              <span className="text-rouge-400">@{normalized} is taken.</span>
            ) : status === "available" ? (
              <span className="text-emerald-400">@{normalized} is available.</span>
            ) : null}
          </div>
          <button
            className="btn-primary w-full py-2.5"
            disabled={status !== "available" || register.isPending}
            onClick={claim}
          >
            {register.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `Claim @${normalized || "username"}`
            )}
          </button>
          <p className="text-[11px] text-ink-muted">
            Registered on-chain (a tiny XRGE fee). Letters, numbers, and underscores.
          </p>
        </div>
      )}
    </Section>
  );
}

function RewardsSection() {
  const { toast } = useToast();
  const { refreshBalance } = useAuth();
  const { data, isLoading } = useEarnings();
  const claim = useClaimEarnings();
  if (!promoteEnabled()) return null;

  const balance = data?.balance ?? 0;
  const claimMin = data?.claimMin ?? 0;
  const canClaim = balance >= claimMin && claimMin > 0 && !claim.isPending;

  return (
    <Section icon={<Rocket className="h-4 w-4" />} title="Ad rewards">
      <p className="text-sm text-ink-muted">
        Earn XRGE for viewing sponsored posts in your feed. Earnings accrue here and
        pay out to your wallet when you claim.
      </p>
      <div className="flex items-center justify-between rounded-xl bg-ink-soft px-3 py-2.5">
        <span className="flex items-center gap-2 text-sm">
          <Coins className="h-4 w-4 text-rouge-400" />
          <span className="font-semibold">
            {isLoading ? "…" : `${balance.toLocaleString(undefined, { maximumFractionDigits: 3 })} XRGE`}
          </span>
        </span>
        <span className="text-xs text-ink-muted">earned</span>
      </div>
      <button
        className="btn-primary w-full py-2.5"
        disabled={!canClaim}
        onClick={() =>
          claim.mutate(undefined, {
            onSuccess: (r) => {
              toast(`Claimed ${(r.claimed ?? 0).toLocaleString()} XRGE 🎉`, "success");
              setTimeout(refreshBalance, 1500);
            },
            onError: (e) => toast(e instanceof Error ? e.message : "Claim failed", "error"),
          })
        }
      >
        {claim.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : balance < claimMin ? (
          `Earn ${claimMin} XRGE to claim`
        ) : (
          "Claim earnings"
        )}
      </button>
    </Section>
  );
}

function MyAdsSection() {
  const { data: ads, isLoading } = useMyAds();
  const { data: promoted } = usePromoted();
  const [boostId, setBoostId] = useState<string | null>(null);
  if (!promoteEnabled()) return null;

  const activeIds = new Set((promoted ?? []).map((a) => a.postId));
  const list = ads ?? [];

  return (
    <Section icon={<Rocket className="h-4 w-4" />} title="Your ads">
      <p className="text-sm text-ink-muted">
        Ad creatives are hidden from your profile and organic feeds — they only
        run as Sponsored posts while boosted. Manage them here.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-xl bg-ink-soft px-3 py-3 text-sm text-ink-muted">
          No ads yet. Toggle “Run as an ad” when creating a post to make one.
        </p>
      ) : (
        <ul className="space-y-2">
          {list.map((post) => (
            <AdRow
              key={post.id}
              post={post}
              active={activeIds.has(post.id)}
              onBoost={() => setBoostId(post.id)}
            />
          ))}
        </ul>
      )}

      {boostId && <BoostModal postId={boostId} onClose={() => setBoostId(null)} />}
    </Section>
  );
}

function AdRow({
  post,
  active,
  onBoost,
}: {
  post: SocialPost;
  active: boolean;
  onBoost: () => void;
}) {
  const [cell] = toMediaCells([post]);
  const decoded = decodeBody(post.body);
  const cap = "data" in decoded ? (decoded.data as { cap?: string }).cap?.trim() : undefined;

  return (
    <li className="flex items-center gap-3 rounded-xl bg-ink-soft p-2">
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ink">
        {cell?.thumbRef ? (
          <MediaImage refUri={cell.thumbRef} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{cap || "Untitled ad"}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs">
          <span
            className={cn(
              "inline-block h-1.5 w-1.5 rounded-full",
              active ? "bg-emerald-400" : "bg-ink-muted",
            )}
          />
          <span className={active ? "text-emerald-400" : "text-ink-muted"}>
            {active ? "Running" : "Not running"}
          </span>
        </div>
      </div>
      <button className="btn-soft shrink-0 px-3 py-1.5 text-sm" onClick={onBoost}>
        {active ? "Add budget" : "Boost"}
      </button>
    </li>
  );
}

function VerifySection({ publicKey, balance }: { publicKey: string; balance: number }) {
  const { toast } = useToast();
  const client = useQueryClient();
  const verified = useVerified(publicKey || undefined);
  const configured = Boolean(getConfig().verifyWorkerUrl);
  const [step, setStep] = useState<"idle" | "sent">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const eligible = balance >= VERIFY_MIN_XRGE;

  async function sendCode() {
    setBusy(true);
    try {
      await startVerify(publicKey);
      setStep("sent");
      toast("Code sent to your RouGee mail.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send code.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!/^\d{6}$/.test(code.trim())) return toast("Enter the 6-digit code.", "error");
    setBusy(true);
    try {
      // The attestation is signed AND stored by the Worker (too large for the
      // on-chain profile), so we just confirm and refresh the badge state.
      await confirmVerify(publicKey, code.trim());
      client.invalidateQueries({ queryKey: ["attestation", publicKey] });
      client.invalidateQueries({ queryKey: ["verify-balance", publicKey] });
      toast("You're verified! ✨", "success");
      setStep("idle");
      setCode("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Verification failed.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section icon={<ShieldCheck className="h-4 w-4" />} title="Verification">
      {verified ? (
        <div className="flex items-center gap-2 text-sm">
          <VerifiedBadge size={20} />
          <span className="font-medium">Your account is verified.</span>
        </div>
      ) : !configured ? (
        <p className="text-sm text-ink-muted">
          Verification isn't available yet. Check back soon.
        </p>
      ) : (
        <>
          <p className="text-sm text-ink-muted">
            Get the gradient check. You need to hold at least{" "}
            <span className="font-semibold text-white">
              {VERIFY_MIN_XRGE.toLocaleString()} XRGE
            </span>{" "}
            and confirm a one-time code we send to your on-chain mail.
          </p>
          <div
            className={cn(
              "rounded-xl px-3 py-2 text-xs",
              eligible ? "bg-emerald-500/10 text-emerald-300" : "bg-ink-soft text-ink-muted",
            )}
          >
            You hold {balance.toLocaleString()} XRGE —{" "}
            {eligible ? "eligible." : `hold ${(VERIFY_MIN_XRGE - balance).toLocaleString()} more to qualify.`}
          </div>

          {step === "idle" ? (
            <button
              className="btn-primary w-full py-2.5"
              disabled={!eligible || busy}
              onClick={sendCode}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code to my mail"}
            </button>
          ) : (
            <div className="space-y-2">
              <input
                className="input text-center font-mono tracking-[0.4em]"
                inputMode="numeric"
                maxLength={6}
                placeholder="______"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <button className="btn-primary w-full py-2.5" disabled={busy} onClick={confirm}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm & verify"}
              </button>
              <button
                className="btn-ghost w-full text-xs"
                disabled={busy}
                onClick={sendCode}
              >
                Resend code
              </button>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-ink-border px-4 py-3">
        <span className="text-rouge-400">{icon}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-ink-soft px-3 py-2 font-mono text-xs">
          {value}
        </code>
        <button
          className="btn-soft h-9 w-9 shrink-0 p-0"
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function AccountSection({
  address,
  balance,
  publicKey,
  mnemonic,
  privateKey,
  onFaucet,
  onRefresh,
}: {
  address: string;
  balance: number;
  publicKey: string;
  mnemonic?: string;
  privateKey: string;
  onFaucet: () => void;
  onRefresh: () => void;
}) {
  const [revealPhrase, setRevealPhrase] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [fauceting, setFauceting] = useState(false);
  // The faucet only exists on testnet — never show it on mainnet (where XRGE is
  // real and there's no faucet), which otherwise makes a mainnet user think
  // they're on testnet.
  const isTestnet = networkIdForUrl(getConfig().apiUrl) === "testnet";

  return (
    <Section icon={<ShieldCheck className="h-4 w-4" />} title="Account">
      <CopyRow label="Address" value={address} />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-soft px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm">
          <Coins className="h-4 w-4 text-rouge-400" />
          <span className="font-semibold">
            {balance.toLocaleString(undefined, { maximumFractionDigits: 3 })} XRGE
          </span>
        </div>
        <div className="flex gap-1.5">
          <button className="btn-ghost h-9 px-2.5" onClick={onRefresh} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </button>
          {isTestnet && (
            <button
              className="btn-soft h-9 px-3 text-xs"
              onClick={async () => {
                setFauceting(true);
                await onFaucet();
                setFauceting(false);
              }}
              disabled={fauceting}
            >
              {fauceting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Get testnet XRGE"}
            </button>
          )}
        </div>
      </div>

      {mnemonic && (
        <div>
          <button
            className="flex w-full items-center justify-between rounded-xl bg-ink-soft px-3 py-2.5 text-sm"
            onClick={() => setRevealPhrase((v) => !v)}
          >
            <span>Recovery phrase</span>
            {revealPhrase ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          {revealPhrase && (
            <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl border border-ink-border bg-ink-soft p-3 text-xs min-[380px]:grid-cols-3">
              {mnemonic.split(/\s+/).map((w, i) => (
                <span key={i} className="font-mono">
                  <span className="text-ink-muted">{i + 1}.</span> {w}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <button
          className="flex w-full items-center justify-between rounded-xl bg-ink-soft px-3 py-2.5 text-sm"
          onClick={() => setShowKeys((v) => !v)}
        >
          <span>Export raw keys</span>
          {showKeys ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        {showKeys && (
          <div className="mt-2 space-y-2">
            <CopyRow label="Public key" value={publicKey} />
            <CopyRow label="Private key" value={privateKey} />
            <p className="text-xs text-rouge-400">
              Never share your private key or recovery phrase. Anyone with them
              controls this account.
            </p>
          </div>
        )}
      </div>
    </Section>
  );
}

function MediaSection() {
  const { toast } = useToast();
  const cfg = getConfig();
  const [cfUrl, setCfUrl] = useState(cfg.cfWorkerUrl);
  const [cfSecret, setCfSecret] = useState(cfg.cfUploadSecret);
  const [cfStreamOn, setCfStreamOn] = useState(cfg.cfStream);
  const [jwt, setJwt] = useState(cfg.pinataJwt);
  const [gateway, setGateway] = useState(cfg.ipfsGateway);
  const [testing, setTesting] = useState(false);

  const backend = activeBackend();

  async function save() {
    setTesting(true);
    try {
      const url = cfUrl.trim().replace(/\/+$/, "");
      if (url) {
        if (!/^https?:\/\/.+/.test(url)) {
          toast("Enter a valid https Worker URL.", "error");
          return;
        }
        const ok = await testCloudflareWorker(url);
        if (!ok) {
          toast("Couldn't reach that Cloudflare Worker.", "error");
          return;
        }
      }
      if (jwt) {
        const ok = await testPinataJwt(jwt);
        if (!ok) {
          toast("That Pinata JWT didn't authenticate.", "error");
          return;
        }
      }
      updateConfig({
        cfWorkerUrl: url,
        cfUploadSecret: cfSecret.trim(),
        cfStream: cfStreamOn,
        pinataJwt: jwt,
        ipfsGateway: gateway,
      });
      toast(
        url
          ? "Cloudflare R2 enabled 🎉"
          : jwt
            ? "IPFS enabled 🎉"
            : "Using local storage",
        "success",
      );
    } finally {
      setTesting(false);
    }
  }

  const status =
    backend === "cloudflare"
      ? { icon: <Cloud className="h-4 w-4" />, cls: "text-emerald-400", text: "Cloudflare R2 active — images & video stored in your bucket, served fast." }
      : backend === "ipfs"
        ? { icon: <Globe className="h-4 w-4" />, cls: "text-emerald-400", text: "IPFS active — media pinned & portable across devices." }
        : { icon: <HardDrive className="h-4 w-4" />, cls: "text-amber-400", text: "Local mode — media stays in this browser. Add Cloudflare (best for video) or Pinata below." };

  return (
    <Section icon={status.icon} title="Media storage">
      <div className="rounded-xl bg-ink-soft px-3 py-2.5 text-xs">
        <span className={status.cls}>{status.text}</span>
      </div>

      <div className="rounded-xl border border-ink-border p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Cloud className="h-4 w-4 text-rouge-400" /> Cloudflare R2
          <span className="rounded bg-rouge-600/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-rouge-400">
            best for video
          </span>
        </div>
        <label className="label">Worker URL</label>
        <input
          className="input font-mono text-xs"
          placeholder="https://rougee-gram-media.<you>.workers.dev"
          value={cfUrl}
          onChange={(e) => setCfUrl(e.target.value)}
          spellCheck={false}
        />
        <label className="label mt-2">Upload secret (optional)</label>
        <input
          className="input font-mono text-xs"
          placeholder="Only if your Worker enforces UPLOAD_SECRET"
          value={cfSecret}
          onChange={(e) => setCfSecret(e.target.value)}
          spellCheck={false}
        />
        <label className="mt-3 flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={cfStreamOn}
            onChange={(e) => setCfStreamOn(e.target.checked)}
            className="h-4 w-4 accent-rouge-600"
          />
          <span>
            Use Cloudflare <b>Stream</b> for video
            <span className="block text-[11px] text-ink-muted">
              Adaptive HLS + auto thumbnails. Needs Stream secrets on the Worker.
            </span>
          </span>
        </label>
        <p className="mt-2 text-[11px] text-ink-muted">
          Deploy the Worker in <code>workers/media</code> (see CLOUDFLARE.md), then
          paste its URL here. Takes priority over IPFS.
        </p>
      </div>

      <div className="rounded-xl border border-ink-border p-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Globe className="h-4 w-4 text-rouge-400" /> IPFS (Pinata)
        </div>
        <label className="label">Pinata JWT</label>
        <textarea
          className="input h-16 resize-none font-mono text-xs"
          placeholder="Paste your Pinata JWT to enable IPFS uploads (optional)"
          value={jwt}
          onChange={(e) => setJwt(e.target.value)}
          spellCheck={false}
        />
        <label className="label mt-2">IPFS gateway</label>
        <input
          className="input font-mono text-xs"
          value={gateway}
          onChange={(e) => setGateway(e.target.value)}
        />
      </div>

      <button className="btn-primary w-full" onClick={save} disabled={testing}>
        {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save storage settings"}
      </button>
    </Section>
  );
}

function NetworkSection() {
  const { toast } = useToast();
  const { refreshBalance } = useAuth();
  const client = useQueryClient();

  const [, bump] = useState(0);
  const cfg = getConfig();
  const [selected, setSelected] = useState<NetworkId>(networkIdForUrl(cfg.apiUrl));
  const [apiUrl, setApiUrl] = useState(cfg.apiUrl);
  const [health, setHealth] = useState<string>("checking…");

  // Re-check node health whenever the applied endpoint changes.
  useEffect(() => {
    let active = true;
    setHealth("checking…");
    rc()
      .getStats()
      .then(
        (s) =>
          active && setHealth(`online · height ${s.network_height ?? s.height}`),
      )
      .catch(() => active && setHealth("unreachable"));
    return () => {
      active = false;
    };
  }, [cfg.apiUrl]);

  function choose(id: NetworkId) {
    setSelected(id);
    if (id !== "custom") setApiUrl(NETWORKS[id].apiUrl);
  }

  const dirty = apiUrl.trim() !== cfg.apiUrl;

  function apply() {
    const url = apiUrl.trim();
    if (!/^https?:\/\/.+/.test(url)) {
      return toast("Enter a valid http(s) API URL.", "error");
    }
    const label = selected === "custom" ? "custom" : selected;
    updateConfig({ apiUrl: url, network: label });
    // Feeds, balances, profiles and resolved addresses are network-specific.
    // Clear the profile module cache FIRST, then reset all queries. resetQueries
    // (unlike clear()) refetches active observers, so the always-mounted profile
    // in the sidebar/right-rail/bottom-nav reloads from the new node instead of
    // showing the previous network's identity until an unrelated re-render.
    clearProfileCache();
    client.resetQueries();
    refreshBalance();
    bump((n) => n + 1); // re-read getConfig() for the applied endpoint
    toast(`Switched to ${label}.`, "success");
  }

  return (
    <Section icon={<Globe className="h-4 w-4" />} title="Network">
      <div>
        <label className="label">Network</label>
        <div className="grid grid-cols-3 gap-1.5">
          {(["testnet", "mainnet", "custom"] as NetworkId[]).map((id) => (
            <button
              key={id}
              onClick={() => choose(id)}
              className={cn(
                "rounded-xl px-3 py-2 text-sm font-medium capitalize transition-colors",
                selected === id
                  ? "bg-rouge-600 text-white"
                  : "bg-ink-soft text-ink-muted hover:text-white",
              )}
            >
              {id === "custom" ? "Custom" : NETWORKS[id as "testnet" | "mainnet"].label}
            </button>
          ))}
        </div>
      </div>

      {selected === "custom" && (
        <div>
          <label className="label">API URL</label>
          <input
            className="input font-mono text-xs"
            value={apiUrl}
            placeholder="https://your-node.example/api"
            onChange={(e) => setApiUrl(e.target.value)}
            spellCheck={false}
          />
        </div>
      )}

      <Row label="Endpoint" value={cfg.apiUrl} mono />
      <Row label="Status" value={health} />

      {dirty && (
        <button className="btn-primary w-full" onClick={apply}>
          Switch network
        </button>
      )}
      <p className="text-xs text-ink-muted">
        Your wallet works on any network — the same key, different chain. Balances
        and posts are per-network. Mainnet has no faucet.
      </p>
    </Section>
  );
}

/** Read-only network indicator for consumers (the switcher is operator-only). */
function ConsumerNetworkBadge() {
  const cfg = getConfig();
  const [health, setHealth] = useState<"online" | "offline" | "checking">("checking");
  useEffect(() => {
    let active = true;
    rc()
      .getStats()
      .then(() => active && setHealth("online"))
      .catch(() => active && setHealth("offline"));
    return () => {
      active = false;
    };
  }, []);
  const label = cfg.network
    ? cfg.network.charAt(0).toUpperCase() + cfg.network.slice(1)
    : "RougeChain";
  return (
    <Section icon={<Globe className="h-4 w-4" />} title="Network">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-muted">Connected to</span>
        <span className="flex items-center gap-2 font-medium">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              health === "online"
                ? "bg-emerald-400"
                : health === "offline"
                  ? "bg-rouge-500"
                  : "bg-ink-muted",
            )}
          />
          {label}
        </span>
      </div>
    </Section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className={mono ? "truncate font-mono text-xs" : "truncate"}>{value}</span>
    </div>
  );
}

function SecuritySection({
  address,
  isExtensionWallet,
}: {
  address: string;
  isExtensionWallet: boolean;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  // Provider wallets (Qwalla / RougeChain extension) keep the key themselves —
  // there's no local password for RouGee to change. Say so rather than hiding it.
  if (isExtensionWallet) {
    return (
      <Section icon={<KeyRound className="h-4 w-4" />} title="Security">
        <p className="text-xs text-ink-muted">
          Your key is managed by your connected wallet (Qwalla or the RougeChain
          extension). Change your password or biometrics there — RouGee never
          stores your key on this device.
        </p>
      </Section>
    );
  }

  function reset() {
    setCur("");
    setNext("");
    setConfirm("");
    setShow(false);
  }

  async function submit() {
    if (next.length < 8) return toast("New password must be at least 8 characters.", "error");
    if (next !== confirm) return toast("New passwords don't match.", "error");
    if (next === cur) return toast("New password matches the current one.", "error");
    setBusy(true);
    try {
      await changePassword(address, cur, next);
      toast("Password changed 🔒", "success");
      reset();
      setOpen(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      toast(/not found/i.test(msg) ? "Wallet not found on this device." : "Current password is incorrect.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section icon={<KeyRound className="h-4 w-4" />} title="Security">
      <button className="btn-soft w-full" onClick={() => setOpen(true)}>
        <Lock className="h-4 w-4" /> Change password
      </button>
      <p className="text-xs text-ink-muted">
        Re-encrypts your account key under a new password on this device. Your
        recovery phrase is unchanged.
      </p>

      {open && (
        <Modal
          onClose={busy ? () => {} : () => setOpen(false)}
          title="Change password"
        >
          <div className="space-y-2">
            <div className="relative">
              <input
                className="input pr-10"
                type={show ? "text" : "password"}
                placeholder="Current password"
                value={cur}
                onChange={(e) => setCur(e.target.value)}
                autoFocus
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-ink-muted"
                aria-label={show ? "Hide" : "Show"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <input
              className="input"
              type={show ? "text" : "password"}
              placeholder="New password (min 8 chars)"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={busy}
            />
            <input
              className="input"
              type={show ? "text" : "password"}
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy}
            />
          </div>
          <button
            className="btn-primary mt-4 w-full py-3"
            onClick={submit}
            disabled={busy || !cur || !next || !confirm}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
          </button>
        </Modal>
      )}
    </Section>
  );
}

function DangerSection({
  address,
  onLock,
  onLogout,
}: {
  address: string;
  onLock: () => void;
  onLogout: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <Section icon={<LogOut className="h-4 w-4" />} title="Session">
      <button className="btn-soft w-full" onClick={onLock}>
        <LogOut className="h-4 w-4" /> Lock account
      </button>
      <button
        className="btn w-full bg-rouge-950/60 text-rouge-300 hover:bg-rouge-900/60"
        onClick={() => setConfirming(true)}
      >
        <Trash2 className="h-4 w-4" /> Remove account from this device
      </button>

      {confirming && (
        <Modal onClose={() => setConfirming(false)} title="Remove account?">
          <p className="text-sm text-ink-muted">
            This deletes the encrypted key for{" "}
            <span className="font-mono text-white">{shortAddress(address)}</span>{" "}
            from this device. You can only restore it with your recovery phrase or
            private key.{" "}
            <span className="text-rouge-400">
              Make sure you have a backup first.
            </span>
          </p>
          <div className="mt-4 flex gap-2">
            <button className="btn-soft flex-1" onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button
              className="btn flex-1 bg-rouge-600 text-white hover:bg-rouge-500"
              onClick={onLogout}
            >
              Remove
            </button>
          </div>
        </Modal>
      )}
    </Section>
  );
}
