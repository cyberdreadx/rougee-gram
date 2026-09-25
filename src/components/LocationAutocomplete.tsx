import { useEffect, useRef, useState } from "react";
import { MapPin, X } from "lucide-react";
import { searchPlaces, type PlaceSuggestion } from "@/lib/photon";

/**
 * Location field with type-ahead suggestions from Photon (OSM). Free-typing is
 * still allowed — the stored value is just the text, so a picked suggestion and
 * a hand-typed place both work. Debounced + abortable so it doesn't spam.
 */
export default function LocationAutocomplete({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const justPicked = useRef(false);

  useEffect(() => {
    if (justPicked.current) {
      justPicked.current = false;
      return;
    }
    if (!focused || value.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const r = await searchPlaces(value, ctrl.signal);
      setSuggestions(r);
      setOpen(r.length > 0);
    }, 300);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [value, focused]);

  function pick(label: string) {
    justPicked.current = true;
    onChange(label);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg bg-ink-soft px-3">
        <MapPin className="h-4 w-4 shrink-0 text-ink-muted" />
        <input
          className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-ink-muted"
          placeholder="Add location"
          value={value}
          maxLength={80}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            // Let a suggestion click register before closing.
            setTimeout(() => setOpen(false), 150);
          }}
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange("");
              setSuggestions([]);
            }}
            className="shrink-0 text-ink-muted hover:text-white"
            aria-label="Clear location"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-ink-border bg-ink-card shadow-xl">
          {suggestions.map((s) => (
            <li key={s.label}>
              <button
                type="button"
                // onMouseDown fires before input blur, so the pick isn't lost.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s.label);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-white/5"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                <span className="truncate">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
