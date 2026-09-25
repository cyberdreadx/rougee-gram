/**
 * Location autocomplete via Photon (photon.komoot.io) — a free, keyless,
 * CORS-friendly geocoder built on OpenStreetMap. No API key or account, which
 * keeps RouGee dependency-light. We only send the typed query (no wallet/user
 * data) and store the chosen label as free text in the post envelope.
 */

const PHOTON = "https://photon.komoot.io/api/";

export interface PlaceSuggestion {
  /** Display label, e.g. "Miami, Florida, United States". */
  label: string;
}

interface PhotonFeature {
  properties?: {
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    type?: string;
    osm_value?: string;
  };
}

function labelFor(f: PhotonFeature): string {
  const p = f.properties ?? {};
  // Prefer a place-ish name; then city/state/country, deduped and joined.
  const parts = [p.name, p.city, p.state, p.country].filter(
    (x): x is string => !!x,
  );
  const seen = new Set<string>();
  const uniq = parts.filter((x) => {
    const k = x.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return uniq.slice(0, 3).join(", ");
}

/** Search places for an autocomplete query. Returns [] on empty/errors. */
export async function searchPlaces(
  query: string,
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  try {
    const url = `${PHOTON}?q=${encodeURIComponent(q)}&limit=6`;
    const res = await fetch(url, { signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: PhotonFeature[] };
    const out: PlaceSuggestion[] = [];
    const seen = new Set<string>();
    for (const f of data.features ?? []) {
      const label = labelFor(f);
      if (label && !seen.has(label)) {
        seen.add(label);
        out.push({ label });
      }
    }
    return out;
  } catch {
    return [];
  }
}
