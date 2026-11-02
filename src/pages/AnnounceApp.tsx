import { useState } from "react";
import { CheckCircle2, Loader2, Megaphone, XCircle } from "lucide-react";
import { useAuth } from "@/store/auth";
import { getSigner, npub } from "@/lib/nostrAuth";
import { NOSTR_RELAYS, getPool } from "@/lib/nostrFeed";
import { buildHandlerEvent, buildRecommendations } from "@/lib/nip89";

type RelayResult = { relay: string; ok: boolean; note?: string };

/**
 * Developer page (rougee.app/dev/announce): publishes Rougee's NIP-89 handler
 * (kind 31990) — plus your recommendation of it (kind 31989) — signed by the
 * Nostr key of the account you're signed into. Re-publishing replaces the
 * previous announcement (same `d` tag), so it's safe to run again.
 */
export default function AnnounceApp() {
  const { address } = useAuth();
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<RelayResult[] | null>(null);
  const [signer, setSigner] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = buildHandlerEvent();

  async function publish() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const s = await getSigner(address || "anon");
      setSigner(s.pubkey);
      const handler = await s.sign(buildHandlerEvent());
      const recs = await Promise.all(buildRecommendations(s.pubkey).map((t) => s.sign(t)));
      const pool = getPool();
      const outcomes = await Promise.allSettled(pool.publish(NOSTR_RELAYS, handler));
      await Promise.allSettled(recs.flatMap((ev) => pool.publish(NOSTR_RELAYS, ev)));
      setResults(
        outcomes.map((o, i) => ({
          relay: NOSTR_RELAYS[i],
          ok: o.status === "fulfilled",
          note: o.status === "rejected" ? String(o.reason).slice(0, 80) : undefined,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 px-4 py-6">
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        <Megaphone className="h-5 w-5 text-rouge-400" /> Announce Rougee on Nostr
      </h1>
      <p className="text-sm text-ink-muted">
        Publishes Rougee's NIP-89 app listing so other Nostr apps can offer "open in Rougee" and app
        directories can find it. It's signed by the Nostr key of the account you're signed into, so
        use the official Rougee account. Safe to run again: it replaces the previous listing.
      </p>

      <details className="rounded-xl border border-ink-border p-3 text-xs">
        <summary className="cursor-pointer text-ink-muted">What gets published</summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify({ kind: preview.kind, tags: preview.tags, content: JSON.parse(preview.content) }, null, 2)}
        </pre>
      </details>

      <button className="btn-primary w-full" onClick={publish} disabled={busy}>
        {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Publish listing"}
      </button>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      {results && (
        <div className="space-y-1.5 text-sm">
          {signer && (
            <p className="break-all text-xs text-ink-muted">Signed by {npub(signer)}</p>
          )}
          {results.map((r) => (
            <div key={r.relay} className="flex items-center gap-2">
              {r.ok ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-400" />
              )}
              <span className="truncate">{r.relay}</span>
              {r.note && <span className="truncate text-xs text-ink-muted">{r.note}</span>}
            </div>
          ))}
          <p className="pt-2 text-xs text-ink-muted">
            {results.filter((r) => r.ok).length} of {results.length} relays accepted it.
          </p>
        </div>
      )}
    </div>
  );
}
