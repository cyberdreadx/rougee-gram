import { useEffect, useState } from "react";
import { nip19 } from "nostr-tools";
import { CheckCircle2, Loader2, Megaphone, XCircle } from "lucide-react";
import { useAuth } from "@/store/auth";
import { getSigner, npub } from "@/lib/nostrAuth";
import { NOSTR_RELAYS, getPool } from "@/lib/nostrFeed";
import {
  buildHandlerEvent,
  buildListingDeletion,
  buildRecommendations,
  HANDLER_D,
  APP_ORIGIN,
  OFFICIAL_HANDLER_PUBKEY,
} from "@/lib/nip89";

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

  // Existing Rougee listings on relays (to recommend the official one).
  const [listings, setListings] = useState<string[]>([]);
  const [recommendFor, setRecommendFor] = useState<string>(npub(OFFICIAL_HANDLER_PUBKEY));
  // Who's signed in, to know whether this is the official account.
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    getSigner(address || "anon")
      .then((s) => setMe(s.pubkey))
      .catch(() => {});
  }, [address]);
  const isOfficial = me === OFFICIAL_HANDLER_PUBKEY;
  const hasStrayListing = !!me && !isOfficial && listings.includes(me);
  useEffect(() => {
    getPool()
      .querySync(NOSTR_RELAYS, { kinds: [31990], "#d": [HANDLER_D] }, { maxWait: 5000 })
      .then((evs) => {
        const authors = evs
          .filter((e) => {
            try {
              return JSON.parse(e.content).website === APP_ORIGIN;
            } catch {
              return false;
            }
          })
          .map((e) => e.pubkey);
        const uniq = [...new Set(authors)];
        setListings(uniq);
      })
      .catch(() => {});
  }, [results]);

  /** mode "listing": publish the app listing + recommend it (official account).
   *  mode "recommend": only recommend an existing listing (e.g. personal account). */
  async function removeMyListing() {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const s = await getSigner(address || "anon");
      setSigner(s.pubkey);
      if (s.pubkey === OFFICIAL_HANDLER_PUBKEY) throw new Error("This is the official listing — not removing it.");
      const del = await s.sign(buildListingDeletion(s.pubkey));
      // Point this account's recommendations at the official listing instead.
      const recs = await Promise.all(buildRecommendations(OFFICIAL_HANDLER_PUBKEY).map((t) => s.sign(t)));
      const pool = getPool();
      const outcomes = await Promise.allSettled(pool.publish(NOSTR_RELAYS, del));
      await Promise.allSettled(recs.flatMap((ev) => pool.publish(NOSTR_RELAYS, ev)));
      setResults(
        outcomes.map((o, i) => ({
          relay: NOSTR_RELAYS[i],
          ok: o.status === "fulfilled",
          note: o.status === "rejected" ? String(o.reason).slice(0, 80) : undefined,
        })),
      );
      setListings((l) => l.filter((x) => x !== s.pubkey));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function publish(mode: "listing" | "recommend") {
    setBusy(true);
    setError(null);
    setResults(null);
    try {
      const s = await getSigner(address || "anon");
      setSigner(s.pubkey);
      let handlerPubkey = s.pubkey;
      if (mode === "listing" && s.pubkey !== OFFICIAL_HANDLER_PUBKEY) {
        throw new Error("Sign in as the official RouGee account to publish the listing.");
      }
      if (mode === "recommend") {
        const d = nip19.decode(recommendFor.trim());
        if (d.type !== "npub") throw new Error("Paste the official Rougee npub");
        handlerPubkey = d.data as string;
      }
      const pool = getPool();
      const recs = await Promise.all(buildRecommendations(handlerPubkey).map((t) => s.sign(t)));
      let outcomes: PromiseSettledResult<string>[];
      if (mode === "listing") {
        const handler = await s.sign(buildHandlerEvent());
        outcomes = await Promise.allSettled(pool.publish(NOSTR_RELAYS, handler));
        await Promise.allSettled(recs.flatMap((ev) => pool.publish(NOSTR_RELAYS, ev)));
      } else {
        // Report on the first recommendation; publish the rest alongside.
        const [first, ...rest] = recs;
        outcomes = await Promise.allSettled(pool.publish(NOSTR_RELAYS, first));
        await Promise.allSettled(rest.flatMap((ev) => pool.publish(NOSTR_RELAYS, ev)));
      }
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
        directories can find it. Everything is signed by the Nostr key of the account you're signed
        into. Safe to run again: it replaces what that account published before.
      </p>

      <details className="rounded-xl border border-ink-border p-3 text-xs">
        <summary className="cursor-pointer text-ink-muted">What gets published</summary>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify({ kind: preview.kind, tags: preview.tags, content: JSON.parse(preview.content) }, null, 2)}
        </pre>
      </details>

      <div className="rounded-xl border border-ink-border p-3">
        <h2 className="text-sm font-semibold">1 · Official Rougee account</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Publishes the app listing. Back up this account's Nostr key first (Settings → Your Nostr
          identity) — only that key can update the listing later.
        </p>
        {me && !isOfficial && (
          <p className="mt-2 text-xs text-amber-400">
            You're not signed in as the official RouGee account, so this is disabled.
          </p>
        )}
        <button
          className="btn-primary mt-3 w-full"
          onClick={() => publish("listing")}
          disabled={busy || !isOfficial}
        >
          {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Publish listing"}
        </button>
      </div>

      <div className="rounded-xl border border-ink-border p-3">
        <h2 className="text-sm font-semibold">2 · Your personal account (optional)</h2>
        <p className="mt-1 text-xs text-ink-muted">
          Vouches for the official listing, which helps Nostr apps that rank apps by who your
          follows recommend. Doesn't publish a second listing.
        </p>
        <input
          className="input mt-3 w-full font-mono text-xs"
          placeholder="Official Rougee npub1…"
          value={recommendFor}
          onChange={(e) => setRecommendFor(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
        {hasStrayListing && (
          <div className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2">
            <p className="text-xs text-amber-300">
              This account published its own Rougee listing. Remove it so only the official one
              shows, and point your recommendation at the official listing.
            </p>
            <button className="btn-soft mt-2 w-full text-sm" onClick={removeMyListing} disabled={busy}>
              Remove my listing
            </button>
          </div>
        )}
        {listings.filter((x) => x !== OFFICIAL_HANDLER_PUBKEY).length > 0 && !hasStrayListing && (
          <p className="mt-1 text-[11px] text-amber-400">
            Other accounts have also published a Rougee listing. The official one is prefilled
            above.
          </p>
        )}
        <button
          className="btn-soft mt-2 w-full"
          onClick={() => publish("recommend")}
          disabled={busy || !recommendFor.trim()}
        >
          Recommend Rougee
        </button>
      </div>

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
