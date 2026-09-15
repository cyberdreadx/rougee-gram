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
} from "lucide-react";
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
import { clearProfileCache } from "@/lib/profile";
import { shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { wallet, address, balance, publicKey, lock, logout, refreshBalance } = useAuth();
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

        <MediaSection />

        <NetworkSection />

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
                  ? "bg-rouge-600 text-ink"
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className={mono ? "truncate font-mono text-xs" : "truncate"}>{value}</span>
    </div>
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
