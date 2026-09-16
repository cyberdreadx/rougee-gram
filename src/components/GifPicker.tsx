import { useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import Modal from "./Modal";

/**
 * GIPHY GIF picker (search + trending). Ported from the Qwalla wallet, reusing
 * the same GIPHY key. Selecting a GIF returns its URL, which the caller attaches
 * to a comment (stored as `gif` in the comment envelope, rendered inline).
 */
const GIPHY_KEY = "jzWGk9fn3u9fcckMiyqYNekZOBHQCDYg";
const GIPHY_SEARCH = "https://api.giphy.com/v1/gifs/search";
const GIPHY_TRENDING = "https://api.giphy.com/v1/gifs/trending";

interface Gif {
  id: string;
  preview: string;
  full: string;
}

interface GiphyImage {
  url?: string;
}
interface GiphyItem {
  id: string;
  images?: {
    fixed_width_small?: GiphyImage;
    fixed_width?: GiphyImage;
    original?: GiphyImage;
  };
}

export default function GifPicker({
  onSelect,
  onClose,
}: {
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const base = q.trim() ? GIPHY_SEARCH : GIPHY_TRENDING;
        const params = new URLSearchParams({ api_key: GIPHY_KEY, limit: "24", rating: "pg-13" });
        if (q.trim()) params.set("q", q.trim());
        const res = await fetch(`${base}?${params}`);
        if (!res.ok) throw new Error("bad response");
        const data = (await res.json()) as { data?: GiphyItem[] };
        if (!active) return;
        const items: Gif[] = (data.data ?? []).map((g) => ({
          id: g.id,
          preview: g.images?.fixed_width_small?.url || g.images?.fixed_width?.url || "",
          full: g.images?.original?.url || "",
        }));
        setGifs(items.filter((g) => g.full));
        if (items.length === 0 && q.trim()) setError("No GIFs found");
      } catch {
        if (active) {
          setGifs([]);
          setError("Couldn't load GIFs");
        }
      } finally {
        if (active) setLoading(false);
      }
    }, q ? 400 : 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <Modal onClose={onClose} title="Add a GIF">
      <div className="mb-3 flex items-center gap-2 rounded-xl bg-ink-soft px-3">
        <Search className="h-4 w-4 shrink-0 text-ink-muted" />
        <input
          className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-ink-muted"
          placeholder="Search GIPHY…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
        />
      </div>

      <div className="min-h-[40vh]">
        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-ink-muted" />
          </div>
        ) : error ? (
          <p className="py-16 text-center text-sm text-ink-muted">{error}</p>
        ) : (
          <div className="columns-3 gap-2 [&>*]:mb-2">
            {gifs.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  onSelect(g.full);
                  onClose();
                }}
                className="block w-full overflow-hidden rounded-lg bg-ink-soft"
              >
                <img src={g.preview} alt="" loading="lazy" className="w-full" />
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="mt-2 text-center text-[11px] text-ink-muted">Powered by GIPHY</p>
    </Modal>
  );
}
