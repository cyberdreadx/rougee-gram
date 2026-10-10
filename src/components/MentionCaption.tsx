import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import Avatar from "./Avatar";

/**
 * Caption textarea with @mention autocomplete. Suggestions come from the handles
 * already cached in react-query (["username", pubkey]) — i.e. people the viewer
 * has encountered in feeds/profiles — so there are no extra network calls. The
 * node has no username prefix-search, so this "people you've seen" set is the
 * practical candidate pool.
 */
export default function MentionCaption({
  value,
  onChange,
  disabled,
  placeholder,
  maxLength,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const client = useQueryClient();
  const [suggestions, setSuggestions] = useState<{ handle: string; pubkey: string }[]>([]);
  const [token, setToken] = useState<{ start: number; len: number } | null>(null);

  const candidates = (prefix: string) => {
    const p = prefix.toLowerCase();
    const out: { handle: string; pubkey: string }[] = [];
    const seen = new Set<string>();
    for (const q of client.getQueryCache().findAll({ queryKey: ["username"] })) {
      const handle = q.state.data as unknown;
      const pubkey = (q.queryKey as unknown[])[1];
      if (
        typeof handle === "string" &&
        handle &&
        typeof pubkey === "string" &&
        pubkey &&
        !seen.has(handle) &&
        handle.toLowerCase().startsWith(p)
      ) {
        seen.add(handle);
        out.push({ handle, pubkey });
        if (out.length >= 6) break;
      }
    }
    return out;
  };

  const detect = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = before.match(/(?:^|[^a-zA-Z0-9_@])@([a-z0-9_]{1,20})$/i);
    if (m) {
      const partial = m[1];
      setToken({ start: caret - partial.length - 1, len: partial.length + 1 });
      setSuggestions(candidates(partial));
    } else {
      setToken(null);
      setSuggestions([]);
    }
  };

  const pick = (handle: string) => {
    if (!token) return;
    const before = value.slice(0, token.start);
    const after = value.slice(token.start + token.len);
    const insert = `@${handle} `;
    onChange(before + insert + after);
    setToken(null);
    setSuggestions([]);
    const pos = before.length + insert.length;
    requestAnimationFrame(() => {
      const el = ref.current;
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  };

  return (
    <div className="relative">
      <textarea
        ref={ref}
        className={className}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onKeyUp={(e) => {
          const el = e.target as HTMLTextAreaElement;
          detect(el.value, el.selectionStart ?? 0);
        }}
        onClick={(e) => {
          const el = e.target as HTMLTextAreaElement;
          detect(el.value, el.selectionStart ?? 0);
        }}
        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
        autoCapitalize="sentences"
        autoCorrect="on"
        spellCheck
      />
      {suggestions.length > 0 && (
        <div className="absolute left-0 z-30 mt-1 w-56 overflow-hidden rounded-lg border border-ink-border bg-ink-card shadow-lg">
          {suggestions.map((s) => (
            <button
              key={s.pubkey}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus; fire before blur
                pick(s.handle);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/5"
            >
              <Avatar seed={s.pubkey} size={24} />
              <span className="font-medium">@{s.handle}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
