import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useGlobalTimeline, qk } from "./useSocial";
import { useAuth } from "@/store/auth";
import { decodeBody, encodeNote, NOTE_TTL_MS } from "@/lib/envelope";
import * as write from "@/lib/write";

export interface Note {
  pubkey: string;
  text: string;
  postId: string;
  at: number;
}

function toMs(s: string): number {
  const n = Number(s);
  if (!Number.isNaN(n) && s.trim() !== "") return n < 1e12 ? n * 1000 : n;
  const p = Date.parse(s);
  return Number.isNaN(p) ? 0 : p;
}

/**
 * DM "notes" — short, ephemeral text statuses (à la Instagram), stored as `note`
 * envelope posts. We surface the latest active (<24h) note per author from the
 * global timeline, with your own note pulled out separately.
 */
export function useNotes(): { notes: Note[]; myNote: Note | null; isLoading: boolean } {
  const { publicKey } = useAuth();
  const { data, isLoading } = useGlobalTimeline();
  const now = Date.now();

  const latest = new Map<string, Note>();
  for (const p of data ?? []) {
    if (p.reply_to_id) continue;
    const d = decodeBody(p.body);
    if (d.kind !== "note") continue;
    const at = toMs(p.created_at);
    if (!at || now - at > NOTE_TTL_MS) continue;
    const text = d.data.txt?.trim();
    if (!text) continue;
    const cur = latest.get(p.author_pubkey);
    if (!cur || at > cur.at) {
      latest.set(p.author_pubkey, { pubkey: p.author_pubkey, text, postId: p.id, at });
    }
  }

  const myNote = latest.get(publicKey) ?? null;
  const notes = [...latest.values()]
    .filter((n) => n.pubkey !== publicKey)
    .sort((a, b) => b.at - a.at);

  return { notes, myNote, isLoading };
}

export function useSetNote() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      if (!wallet) throw new Error("Locked");
      const body = text.trim();
      if (!body) throw new Error("Empty note");
      const res = await write.createPost(
        { wallet, publicKey, isExtensionWallet },
        encodeNote(body),
      );
      if (!res.success) throw new Error(res.error || "Could not post note");
      return res;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.timeline }),
  });
}

export function useClearNote() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      if (!wallet) throw new Error("Locked");
      const res = await write.deletePost(
        { wallet, publicKey, isExtensionWallet },
        postId,
      );
      if (!res.success) throw new Error(res.error || "Could not clear note");
      return res;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: qk.timeline }),
  });
}
