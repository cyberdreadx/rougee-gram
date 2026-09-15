import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MessengerMessage, MessengerWallet } from "@rougechain/sdk";
import { rc } from "@/lib/rouge";
import { useAuth } from "@/store/auth";
import { deriveKemKeypair, encryptForRecipients, decryptEnvelope } from "@/lib/pqc";

function toMs(s: string | number): number {
  if (typeof s === "number") return s < 1e12 ? s * 1000 : s;
  const n = Number(s);
  if (!Number.isNaN(n) && s.trim() !== "") return n < 1e12 ? n * 1000 : n;
  const p = Date.parse(s);
  return Number.isNaN(p) ? 0 : p;
}

/** My deterministically-derived ML-KEM keypair (cached forever per session). */
export function useMyKem() {
  const { wallet } = useAuth();
  return useQuery({
    queryKey: ["kem", wallet?.publicKey],
    enabled: !!wallet,
    staleTime: Infinity,
    queryFn: () => deriveKemKeypair(wallet!),
  });
}

export interface DirEntry {
  id: string;
  displayName: string;
  encryptionPublicKey: string;
}

// The API returns snake_case (encryption_public_key), but the SDK type declares
// camelCase — read both so KEM keys actually resolve.
function normWallet(w: MessengerWallet): DirEntry {
  const raw = w as unknown as Record<string, string>;
  return {
    id: raw.id,
    displayName: raw.display_name ?? raw.displayName ?? "",
    encryptionPublicKey: raw.encryption_public_key ?? raw.encryptionPublicKey ?? "",
  };
}

/** Registered messenger wallets, id → normalized entry (for resolving KEM keys). */
export function useMessengerDirectory() {
  return useQuery({
    queryKey: ["messenger-wallets"],
    staleTime: 60_000,
    queryFn: async () => {
      const list = await rc()
        .messenger.getWallets()
        .catch(() => [] as MessengerWallet[]);
      const map = new Map<string, DirEntry>();
      for (const w of list) {
        const e = normWallet(w);
        if (e.id) map.set(e.id, e);
      }
      return map;
    },
  });
}

/** Publish my encryption public key so others can message me (once). */
export function useEnsureRegistered() {
  const { wallet, publicKey, address } = useAuth();
  const { data: kem } = useMyKem();
  useEffect(() => {
    if (!wallet || !kem) return;
    const flag = `rougee-gram:msg-reg:${publicKey.slice(0, 24)}:${kem.publicKeyHex.slice(0, 12)}`;
    if (localStorage.getItem(flag)) return;
    rc()
      .messenger.registerWallet(wallet, {
        id: publicKey,
        displayName: address.slice(0, 16),
        signingPublicKey: publicKey,
        encryptionPublicKey: kem.publicKeyHex,
        discoverable: true,
      })
      .then((res) => {
        if (res.success) localStorage.setItem(flag, "1");
      })
      .catch(() => {});
  }, [wallet, kem, publicKey, address]);
}

export function useConversations() {
  const { wallet, publicKey } = useAuth();
  return useQuery({
    queryKey: ["conversations", publicKey],
    enabled: !!wallet,
    refetchInterval: 15_000,
    queryFn: () => rc().messenger.getConversations(wallet!),
  });
}

export interface DecryptedMessage extends MessengerMessage {
  text: string;
  mine: boolean;
}

export function useMessages(conversationId: string | undefined) {
  const { wallet, publicKey } = useAuth();
  const { data: kem } = useMyKem();
  return useQuery({
    queryKey: ["messages", conversationId, publicKey],
    enabled: !!wallet && !!conversationId && !!kem,
    refetchInterval: 8000,
    queryFn: async (): Promise<DecryptedMessage[]> => {
      const msgs = await rc().messenger.getMessages(wallet!, conversationId!);
      const out: DecryptedMessage[] = [];
      for (const m of msgs) {
        let text = "";
        try {
          text = await decryptEnvelope(m.encrypted_content, publicKey, kem!.secretKey);
        } catch {
          text = "🔒 Unable to decrypt";
        }
        out.push({ ...m, text, mine: m.sender_wallet_id === publicKey });
      }
      out.sort((a, b) => toMs(a.created_at) - toMs(b.created_at));
      return out;
    },
  });
}

export function useSendMessage(conversationId: string, participantIds: string[]) {
  const { wallet, publicKey } = useAuth();
  const { data: dir } = useMessengerDirectory();
  const { data: kem } = useMyKem();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      if (!wallet || !kem) throw new Error("Locked");
      const body = text.trim();
      if (!body) throw new Error("Empty message");
      const recips: { id: string; kemPublicKeyHex: string }[] = [];
      for (const id of new Set([publicKey, ...participantIds])) {
        if (id === publicKey) {
          recips.push({ id, kemPublicKeyHex: kem.publicKeyHex });
        } else {
          const w = dir?.get(id);
          if (w?.encryptionPublicKey) {
            recips.push({ id, kemPublicKeyHex: w.encryptionPublicKey });
          }
        }
      }
      const envelope = await encryptForRecipients(body, recips);
      const res = await rc().messenger.sendMessage(wallet, conversationId, envelope, {
        messageType: "text",
      });
      if (!res.success) throw new Error(res.error || "Send failed");
      return res;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["messages", conversationId, publicKey] });
      client.invalidateQueries({ queryKey: ["conversations", publicKey] });
    },
  });
}

export function useStartConversation() {
  const { wallet, publicKey } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (recipientPubkey: string): Promise<string> => {
      if (!wallet) throw new Error("Locked");
      const dir = await rc().messenger.getWallets().catch(() => [] as MessengerWallet[]);
      const rec = dir.map(normWallet).find((w) => w.id === recipientPubkey);
      if (!rec?.encryptionPublicKey) {
        throw new Error("That user hasn't enabled messaging yet.");
      }
      const res = await rc().messenger.createConversation(wallet, [
        publicKey,
        recipientPubkey,
      ]);
      if (!res.success) throw new Error(res.error || "Could not start conversation");
      const data = (res.data ?? {}) as {
        conversationId?: string;
        id?: string;
        conversation?: { id?: string };
      };
      let id = data.conversationId || data.id || data.conversation?.id;
      if (!id) {
        const convos = await rc().messenger.getConversations(wallet);
        id = convos.find((c) => c.participants?.includes(recipientPubkey))?.id;
      }
      if (!id) throw new Error("Conversation created, but no id was returned.");
      return id;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["conversations", publicKey] }),
  });
}
