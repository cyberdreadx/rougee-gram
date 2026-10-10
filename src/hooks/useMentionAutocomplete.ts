import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { rc } from "@/lib/rouge";
import { reverseUsername } from "@/lib/username";
import { searchUsers } from "@/lib/directory";

export interface MentionSuggestion {
  handle: string;
  pubkey: string;
}

/**
 * Warm the @mention candidate pool: resolve handles for the people the viewer
 * follows into the react-query username cache (the same cache the autocomplete
 * reads). The node has no username prefix-search, so "people you follow" is the
 * practical pool. Runs once per session (prefetchQuery respects staleTime), and
 * is throttled so it doesn't burst the node.
 */
export function usePrefetchMentionCandidates() {
  const { publicKey } = useAuth();
  const client = useQueryClient();
  useEffect(() => {
    if (!publicKey) return;
    let cancelled = false;
    (async () => {
      try {
        const following: string[] = await client.fetchQuery({
          queryKey: ["following", publicKey],
          queryFn: () => rc().social.getUserFollowing(publicKey),
          staleTime: 5 * 60_000,
        });
        const pubkeys = following.slice(0, 200);
        let i = 0;
        const worker = async () => {
          while (!cancelled && i < pubkeys.length) {
            const pk = pubkeys[i++];
            await client
              .prefetchQuery({
                queryKey: ["username", pk],
                queryFn: () => reverseUsername(pk),
                staleTime: 5 * 60_000,
              })
              .catch(() => {});
          }
        };
        await Promise.all(Array.from({ length: 6 }, worker)); // 6-way concurrency
      } catch {
        /* no following / offline — autocomplete just stays sparse */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publicKey, client]);
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
  const partialRef = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const merge = (a: MentionSuggestion[], b: MentionSuggestion[]) => {
    const seen = new Set(a.map((s) => s.handle));
    const out = [...a];
    for (const s of b) if (s.handle && !seen.has(s.handle)) (seen.add(s.handle), out.push(s));
    return out.slice(0, 8);
  };

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
      if (timer.current) clearTimeout(timer.current);
      if (!m) {
        token.current = null;
        partialRef.current = "";
        setSuggestions([]);
        return;
      }
      const partial = m[1];
      token.current = { start: caret - partial.length - 1, len: partial.length + 1 };
      partialRef.current = partial;
      const local = candidates(partial); // instant, from cache
      setSuggestions(local);
      // Then search the directory (everyone), debounced; merge when it returns.
      timer.current = setTimeout(async () => {
        const results = await searchUsers(partial, 8);
        if (partialRef.current !== partial) return; // stale — user typed on
        setSuggestions(merge(local, results));
      }, 220);
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
