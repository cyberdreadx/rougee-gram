import { useEffect, useMemo, useSyncExternalStore } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MessengerConversation,
  MessengerMessage,
  MessengerWallet,
} from "@rougechain/sdk";
import { rc } from "@/lib/rouge";
import { useAuth } from "@/store/auth";
import { useFollowing } from "@/hooks/useSocial";
import { deriveKemKeypair, encryptForRecipients, decryptEnvelope } from "@/lib/pqc";
import * as extSigner from "@/lib/extensionSigner";
import {
  acceptConversation,
  blockPubkey,
  unblockPubkey,
  getGateSnapshot,
  parseGate,
  subscribeGate,
} from "@/lib/dmGate";

function toMs(s: string | number): number {
  if (typeof s === "number") return s < 1e12 ? s * 1000 : s;
  const n = Number(s);
  if (!Number.isNaN(n) && s.trim() !== "") return n < 1e12 ? n * 1000 : n;
  const p = Date.parse(s);
  return Number.isNaN(p) ? 0 : p;
}

/**
 * A KEM "session" for DMs: the wallet's encryption public key plus a decrypt
 * function. Local wallets derive the keypair from the seed and decrypt in-page;
 * provider wallets (Qwalla / extension) get the public key from the wallet's KEM
 * bridge and delegate decryption to it, so the seed never leaves the wallet.
 */
export interface KemSession {
  publicKeyHex: string;
  decrypt: (envelope: string, myId: string) => Promise<string>;
}

/** True for a provider wallet whose host exposes the DM KEM bridge. */
function useKemBridge(): boolean {
  const { isExtensionWallet } = useAuth();
  return isExtensionWallet && extSigner.supportsKemBridge();
}

/** Whether the signed-in wallet can use DMs: a local wallet, or a provider
 *  wallet (Qwalla/extension) whose host exposes the KEM bridge. */
export function useDmCapable(): boolean {
  const { isExtensionWallet } = useAuth();
  return !isExtensionWallet || extSigner.supportsKemBridge();
}

/** My KEM session (cached per session). Enabled for local wallets, or provider
 *  wallets whose host supports the bridge. */
export function useMyKem() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const bridge = useKemBridge();
  return useQuery<KemSession>({
    queryKey: ["kem", publicKey, bridge],
    // Provider wallets without the bridge can't derive a KEM key → DMs gated off.
    enabled: !!wallet && (!isExtensionWallet || bridge),
    staleTime: Infinity,
    queryFn: async (): Promise<KemSession> => {
      if (bridge) {
        const publicKeyHex = await extSigner.getEncryptionPublicKey();
        return { publicKeyHex, decrypt: (env, myId) => extSigner.kemDecrypt(env, myId) };
      }
      const kp = await deriveKemKeypair(wallet!);
      return {
        publicKeyHex: kp.publicKeyHex,
        decrypt: (env, myId) => decryptEnvelope(env, myId, kp.secretKey),
      };
    },
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
  const { wallet, publicKey, address, isExtensionWallet } = useAuth();
  const bridge = useKemBridge();
  const { data: kem } = useMyKem();
  useEffect(() => {
    // Register local wallets, or provider wallets that support the KEM bridge.
    if (!wallet || !kem || (isExtensionWallet && !bridge)) return;
    const flag = `rougee-gram:msg-reg:${publicKey.slice(0, 24)}:${kem.publicKeyHex.slice(0, 12)}`;
    if (localStorage.getItem(flag)) return;
    const opts = {
      id: publicKey,
      displayName: address.slice(0, 16),
      signingPublicKey: publicKey,
      encryptionPublicKey: kem.publicKeyHex,
      discoverable: true,
    };
    const p = isExtensionWallet
      ? extSigner.messengerRegister(publicKey, opts)
      : rc().messenger.registerWallet(wallet, opts);
    p.then((res) => {
      if (res.success) localStorage.setItem(flag, "1");
    }).catch(() => {});
  }, [wallet, kem, publicKey, address, isExtensionWallet, bridge]);
}

export function useConversations() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const canDm = useDmCapable();
  return useQuery({
    queryKey: ["conversations", publicKey],
    // Only poll when DMs are actually usable. For a provider wallet WITHOUT the
    // KEM bridge every request would be provider-signed → a wallet approval
    // popup on each 15s poll, so we must not run it at all.
    enabled: !!wallet && canDm,
    // Provider wallets sign every read through the wallet (approval prompt), so
    // never poll them in the background — fetch once on open. Local wallets sign
    // silently in-page, so keep them live.
    refetchInterval: isExtensionWallet ? false : 15_000,
    // Don't retry-storm the wallet with sign prompts if a signed read fails.
    retry: false,
    queryFn: () =>
      isExtensionWallet
        ? (extSigner.messengerListConversations(publicKey) as Promise<MessengerConversation[]>)
        : rc().messenger.getConversations(wallet!),
  });
}

/** Total unread messages across conversations (0 when none / not loaded). */
export function useUnreadCount(): number {
  const { data } = useConversations();
  if (!data) return 0;
  return data.reduce((sum, c) => sum + (c.unread_count ?? 0), 0);
}

export interface DecryptedMessage extends MessengerMessage {
  text: string;
  mine: boolean;
}

export function useMessages(
  conversationId: string | undefined,
  opts?: { enabled?: boolean },
) {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const { data: kem } = useMyKem();
  return useQuery({
    queryKey: ["messages", conversationId, publicKey],
    // `enabled` lets callers keep a request's contents un-fetched (and thus
    // un-decrypted) until it's accepted — see the message-request gate.
    enabled: (opts?.enabled ?? true) && !!wallet && !!conversationId && !!kem,
    // See useConversations: don't background-poll provider wallets (each poll is
    // a wallet signature prompt). Fetch on open; local wallets stay live.
    refetchInterval: isExtensionWallet ? false : 8000,
    retry: false,
    queryFn: async (): Promise<DecryptedMessage[]> => {
      const msgs = isExtensionWallet
        ? ((await extSigner.messengerListMessages(publicKey, conversationId!)) as MessengerMessage[])
        : await rc().messenger.getMessages(wallet!, conversationId!);
      const out: DecryptedMessage[] = [];
      for (const m of msgs) {
        let text = "";
        try {
          text = await kem!.decrypt(m.encrypted_content, publicKey);
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
  const { wallet, publicKey, isExtensionWallet } = useAuth();
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
      const res = isExtensionWallet
        ? await extSigner.messengerSendMessage(publicKey, conversationId, envelope)
        : await rc().messenger.sendMessage(wallet, conversationId, envelope, {
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

/**
 * Delete a whole conversation. The node drops it for the caller; the other
 * participant keeps their own copy (there's no global delete on-chain), so the
 * UI should say "delete for me" rather than promise it's gone everywhere.
 */
export function useDeleteConversation() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!wallet) throw new Error("Locked");
      const res = isExtensionWallet
        ? await extSigner.messengerDeleteConversation(publicKey, conversationId)
        : await rc().messenger.deleteConversation(wallet, conversationId);
      if (!res.success) throw new Error(res.error || "Could not delete conversation");
      return res;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["conversations", publicKey] });
    },
  });
}

/** Delete a single message from a conversation (for the caller). */
export function useDeleteMessage(conversationId: string) {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (messageId: string) => {
      if (!wallet) throw new Error("Locked");
      const res = isExtensionWallet
        ? await extSigner.messengerDeleteMessage(publicKey, messageId, conversationId)
        : await rc().messenger.deleteMessage(wallet, messageId, conversationId);
      if (!res.success) throw new Error(res.error || "Could not delete message");
      return res;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["messages", conversationId, publicKey] });
      client.invalidateQueries({ queryKey: ["conversations", publicKey] });
    },
  });
}

export function useStartConversation() {
  const { wallet, publicKey, address, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    // Accepts one or more recipient pubkeys (group chat when >1).
    mutationFn: async (recipientPubkeys: string[]): Promise<string> => {
      if (!wallet) throw new Error("Locked");
      const recips = [...new Set(recipientPubkeys.filter((p) => p && p !== publicKey))];
      if (!recips.length) throw new Error("Add at least one recipient.");
      const dir = (await rc().messenger.getWallets().catch(() => [] as MessengerWallet[])).map(
        normWallet,
      );
      for (const p of recips) {
        if (!dir.find((w) => w.id === p)?.encryptionPublicKey) {
          throw new Error("A recipient hasn't enabled messaging yet.");
        }
      }
      const participants = [publicKey, ...recips];
      const isGroup = recips.length > 1;
      const res = isExtensionWallet
        ? await extSigner.messengerCreateConversation(publicKey, participants, isGroup)
        : await rc().messenger.createConversation(wallet, participants, { isGroup });
      if (!res.success) throw new Error(res.error || "Could not start conversation");
      const data = (res.data ?? {}) as {
        conversationId?: string;
        id?: string;
        conversation?: { id?: string };
      };
      let id = data.conversationId || data.id || data.conversation?.id;
      if (!id) {
        const convos = (
          isExtensionWallet
            ? ((await extSigner.messengerListConversations(publicKey)) as MessengerConversation[])
            : await rc().messenger.getConversations(wallet)
        );
        id = convos.find((c) => recips.every((r) => c.participants?.includes(r)))?.id;
      }
      if (!id) throw new Error("Conversation created, but no id was returned.");
      return id;
    },
    onSuccess: (id) => {
      // A conversation you start is trusted — auto-accept so it lands in Primary,
      // never Requests.
      acceptConversation(address, id);
      client.invalidateQueries({ queryKey: ["conversations", publicKey] });
    },
  });
}

// ===== Message-request gate =====

export type DmBucket = "primary" | "request" | "blocked";

/** Reactive view of the local accept/block gate for the signed-in account. */
export function useDmGate() {
  const { address } = useAuth();
  const snap = useSyncExternalStore(
    subscribeGate,
    () => getGateSnapshot(address),
    () => "",
  );
  const gate = useMemo(() => parseGate(snap), [snap]);
  return useMemo(
    () => ({
      accepted: new Set(gate.accepted),
      blocked: new Set(gate.blocked),
      accept: (conversationId: string) => acceptConversation(address, conversationId),
      block: (pubkey: string) => blockPubkey(address, pubkey),
      unblock: (pubkey: string) => unblockPubkey(address, pubkey),
    }),
    [gate, address],
  );
}

/** Classify a conversation: Primary (trusted), Request (unknown sender), or
 *  Blocked (rejected — hidden entirely). */
export function classifyConversation(
  c: MessengerConversation,
  opts: {
    publicKey: string;
    following: Set<string>;
    accepted: Set<string>;
    blocked: Set<string>;
  },
): DmBucket {
  const others = (c.participants ?? []).filter((p) => p !== opts.publicKey);
  const isGroup = others.length > 1;
  const otherId = others[0];
  if (!isGroup && otherId && opts.blocked.has(otherId)) return "blocked";
  if (opts.accepted.has(c.id)) return "primary";
  if (isGroup) return "primary"; // group threads aren't gated for now
  if (otherId && opts.following.has(otherId)) return "primary"; // people you follow are trusted
  return "request";
}

/** Split conversations into Primary and Requests using the follow graph + gate. */
export function useConversationBuckets() {
  const { publicKey } = useAuth();
  const convos = useConversations();
  const gate = useDmGate();
  const { data: followingList } = useFollowing(publicKey || undefined);
  const following = useMemo(() => new Set(followingList ?? []), [followingList]);

  const { primary, requests } = useMemo(() => {
    const primary: MessengerConversation[] = [];
    const requests: MessengerConversation[] = [];
    for (const c of convos.data ?? []) {
      const bucket = classifyConversation(c, {
        publicKey,
        following,
        accepted: gate.accepted,
        blocked: gate.blocked,
      });
      if (bucket === "primary") primary.push(c);
      else if (bucket === "request") requests.push(c);
    }
    return { primary, requests };
  }, [convos.data, publicKey, following, gate.accepted, gate.blocked]);

  return { primary, requests, isLoading: convos.isLoading, gate };
}
