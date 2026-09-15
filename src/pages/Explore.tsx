import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, X, ArrowRight } from "lucide-react";
import type { SocialPost } from "@rougechain/sdk";
import { useGlobalTimeline } from "@/hooks/useSocial";
import PhotoGrid from "@/components/PhotoGrid";
import WhoToFollow from "@/components/WhoToFollow";
import UserRow from "@/components/UserRow";
import { resolveAddress, handleFromAddress, shortAddress } from "@/lib/format";

export default function Explore() {
  const { data, isLoading } = useGlobalTimeline();
  const [q, setQ] = useState("");
  const authors = useMemo(() => uniqueAuthors(data), [data]);
  const searching = q.trim().length > 0;

  return (
    <div>
      <header className="sticky top-[var(--top-bar-h)] z-20 border-b border-ink-border bg-ink/80 p-3 backdrop-blur md:top-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            className="input pl-9 pr-9"
            placeholder="Search people (rouge1… address or handle)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          {searching && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-muted hover:text-white"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {searching ? (
        <SearchResults query={q} authors={authors} />
      ) : (
        <>
          <div className="p-3 lg:hidden">
            <WhoToFollow limit={5} />
          </div>
          <div className="p-0.5 sm:p-1">
            <PhotoGrid posts={data} isLoading={isLoading} />
          </div>
        </>
      )}
    </div>
  );
}

function SearchResults({
  query,
  authors,
}: {
  query: string;
  authors: string[];
}) {
  const [dir, setDir] = useState<{ pubkey: string; address: string; handle: string }[]>([]);

  useEffect(() => {
    let active = true;
    Promise.all(
      authors.map(async (pk) => {
        const address = await resolveAddress(pk);
        return { pubkey: pk, address, handle: handleFromAddress(address) };
      }),
    ).then((list) => active && setDir(list));
    return () => {
      active = false;
    };
  }, [authors]);

  const q = query.trim().toLowerCase();
  const matches = dir.filter(
    (d) => d.address.toLowerCase().includes(q) || d.handle.includes(q),
  );
  const looksLikeAddress = /^rouge1[0-9a-z]{6,}$/i.test(query.trim());

  return (
    <div className="space-y-4 p-4">
      {looksLikeAddress && (
        <Link
          to={`/u/${query.trim()}`}
          className="flex items-center gap-3 rounded-xl border border-ink-border bg-ink-soft px-3 py-3 hover:bg-white/5"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rouge-600/15 text-rouge-400">
            <ArrowRight className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Open account</div>
            <div className="truncate font-mono text-xs text-ink-muted">
              {shortAddress(query.trim(), 16, 8)}
            </div>
          </div>
        </Link>
      )}

      {matches.length > 0 && (
        <div className="space-y-3.5">
          {matches.map((m) => (
            <UserRow key={m.pubkey} pubkey={m.pubkey} />
          ))}
        </div>
      )}

      {!looksLikeAddress && matches.length === 0 && (
        <p className="py-10 text-center text-sm text-ink-muted">
          No people found for “{query.trim()}”. Try a full rouge1… address.
        </p>
      )}
    </div>
  );
}

function uniqueAuthors(posts: SocialPost[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of posts ?? []) {
    if (p.reply_to_id || !p.author_pubkey || seen.has(p.author_pubkey)) continue;
    seen.add(p.author_pubkey);
    out.push(p.author_pubkey);
    if (out.length >= 40) break;
  }
  return out;
}
