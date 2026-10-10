import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export interface MentionSuggestion {
  handle: string;
  pubkey: string;
}

/**
 * @mention autocomplete for a text field. Candidates come from handles already
 * cached in react-query (["username", pubkey]) — people the viewer has seen in
 * feeds/profiles — so there are no extra network calls (the node has no username
 * prefix-search). Works with any <input> or <textarea>.
 */
export function useMentionAutocomplete(value: string, onChange: (v: string) => void) {
  const client = useQueryClient();
  const [suggestions, setSuggestions] = useState<MentionSuggestion[]>([]);
  const token = useRef<{ start: number; len: number } | null>(null);

  const candidates = useCallback(
    (prefix: string): MentionSuggestion[] => {
      const p = prefix.toLowerCase();
      const out: MentionSuggestion[] = [];
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
    },
    [client],
  );

  /** Call on change/keyup/click with the current text + caret position. */
  const detect = useCallback(
    (text: string, caret: number) => {
      const before = text.slice(0, caret);
      const m = before.match(/(?:^|[^a-zA-Z0-9_@])@([a-z0-9_]{1,20})$/i);
      if (m) {
        const partial = m[1];
        token.current = { start: caret - partial.length - 1, len: partial.length + 1 };
        setSuggestions(candidates(partial));
      } else {
        token.current = null;
        setSuggestions([]);
      }
    },
    [candidates],
  );

  /** Replace the active @token with @handle and restore the caret after it. */
  const pick = useCallback(
    (handle: string, el?: HTMLInputElement | HTMLTextAreaElement | null) => {
      const tk = token.current;
      if (!tk) return;
      const before = value.slice(0, tk.start);
      const after = value.slice(tk.start + tk.len);
      const insert = `@${handle} `;
      onChange(before + insert + after);
      token.current = null;
      setSuggestions([]);
      const pos = before.length + insert.length;
      requestAnimationFrame(() => {
        if (el) {
          el.focus();
          el.setSelectionRange(pos, pos);
        }
      });
    },
    [value, onChange],
  );

  const clear = useCallback(() => setSuggestions([]), []);

  return { suggestions, detect, pick, clear };
}
