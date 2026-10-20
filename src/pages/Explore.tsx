import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Search, X, ArrowRight, Hash, Loader2, TrendingUp } from "lucide-react";
import { soundsEnabled } from "@/lib/sounds";
import type { SocialPost } from "@rougechain/sdk";
import { useGlobalTimeline } from "@/hooks/useSocial";
import { useHashtagFeed } from "@/hooks/useNostrFeed";
import ExploreGrid from "@/components/ExploreGrid";
import FeedList from "@/components/FeedList";
import WhoToFollow from "@/components/WhoToFollow";
import UserRow from "@/components/UserRow";
import { resolveAddress, handleFromAddress, shortAddress } from "@/lib/format";

export default function Explore() {
  const { t } = useTranslation();
  const { data, isLoading } = useGlobalTimeline();
  const [q, setQ] = useState("");
  const authors = useMemo(() => uniqueAuthors(data), [data]);
  const searching = q.trim().length > 0;

  return (
    <div>
      <header className="sticky top-[var(--top-bar-h)] z-20 border-b border-ink-border bg-ink/55 p-3 backdrop-blur md:top-0">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            className="input pl-9 pr-9"
            placeholder={t("explore.searchPlaceholder")}
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
              aria-label={t("explore.clear")}
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
          {soundsEnabled() && (
            <Link
              to="/sounds"
              className="mx-3 mt-3 flex items-center gap-2 rounded-xl border border-ink-border bg-ink-soft px-3 py-2.5 text-sm font-medium transition-colors hover:bg-white/5"
            >
              <TrendingUp className="h-4 w-4 text-rouge-400" /> {t("sound.trending")}
              <ArrowRight className="ml-auto h-4 w-4 text-ink-muted" />
            </Link>
          )}
          <div className="p-3 lg:hidden">
            <WhoToFollow limit={5} />
          </div>
          <div className="p-0.5 sm:p-1">
            <ExploreGrid posts={data} isLoading={isLoading} showSponsored />
          </div>
          {/* Discovery is text-heavy too — the media grid hides text posts, so
              show the latest ones here or they'd be invisible. */}
          <h2 className="px-4 pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("explore.latestPosts")}
          </h2>
          <FeedList
            posts={data}
            isLoading={isLoading}
            textOnly
            showSponsored
            emptyState={
              <div className="px-6 py-10 text-center text-sm text-ink-muted">
                {t("explore.noTextPosts")}
              </div>
            }
          />
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
  const { t } = useTranslation();
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
  // A single tag-like word (optionally #-prefixed) → search it as a topic,
  // debounced so we don't fire a relay query on every keystroke.
  const rawTag = /^#?[\p{L}\p{N}_]{2,30}$/u.test(query.trim())
    ? query.trim().toLowerCase().replace(/^#/, "")
    : "";
  const [tagSlug, setTagSlug] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setTagSlug(rawTag), 300);
    return () => clearTimeout(id);
  }, [rawTag]);
  const hash = useHashtagFeed(tagSlug, !!tagSlug);

  return (
    <div className="space-y-4 p-4">
      {tagSlug && (
        <div>
          <Link
            to={`/tag/${encodeURIComponent(tagSlug)}`}
            className="mb-2 flex items-center justify-between hover:opacity-90"
          >
            <span className="flex items-center gap-1.5 text-sm font-semibold">
              <Hash className="h-4 w-4 text-rouge-400" />
              {tagSlug}
            </span>
            {hash.posts.length > 0 && (
              <span className="text-xs font-medium text-rouge-400">{t("explore.seeAll")}</span>
            )}
          </Link>
          {hash.loading && hash.posts.length === 0 ? (
            <div className="py-6 text-center">
              <Loader2 className="mx-auto h-4 w-4 animate-spin text-ink-muted" />
            </div>
          ) : hash.posts.length > 0 ? (
            <FeedList posts={hash.posts.slice(0, 6)} isLoading={false} />
          ) : (
            <p className="py-4 text-center text-xs text-ink-muted">
              {t("explore.noTagPosts", { tag: tagSlug })}
            </p>
          )}
        </div>
      )}

      {looksLikeAddress && (
        <Link
          to={`/u/${query.trim()}`}
          className="flex items-center gap-3 rounded-xl border border-ink-border bg-ink-soft px-3 py-3 hover:bg-white/5"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rouge-600/15 text-rouge-400">
            <ArrowRight className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">{t("explore.openAccount")}</div>
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
          {t("explore.noPeople", { query: query.trim() })}
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
