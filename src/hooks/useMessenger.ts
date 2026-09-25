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
import {
  deriveKemKeypair,
  encryptForRecipients,
  decryptEnvelope,
  encryptMessage,
  decryptMessage,
  isV1Envelope,
} from "@/lib/pqc";
import * as extSigner from "@/lib/extensionSigner";
import {
  acceptConversation,
  blockPubkey,
  unblockPubkey,
  getGateSnapshot,
  parseGate,
  subscribeGate,
} from "@/lib/dmGate";

/**
 * A conversation's member pubkeys. The node serializes this as `participant_ids`
 * (see quantum-vault messenger_store `Conversation`), but the SDK type declares
 * `participants` — so `c.participants` is always undefined and every thread looks
 * memberless (own face on the row, all threads collapsed to one, broken recipient
 * lists). Read `participant_ids` with `participants`/`participantIds` fallbacks.
 */
export function convoParticipants(c: MessengerConversation | undefined | null): string[] {
  const raw = c as unknown as {
    participant_ids?: string[];
    participants?: string[];
    participantIds?: string[];
  } | null;
  return raw?.participant_ids ?? raw?.participants ?? raw?.participantIds ?? [];
}

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
        // Route by format: legacy v1 multi-recipient envelopes vs the Qwalla
        // message format (new 1:1 DMs, cross-readable with Qwalla native).
        decrypt: (env, myId) =>
          isV1Envelope(env)
            ? decryptEnvelope(env, myId, kp.secretKey)
            : decryptMessage(env, kp.secretKey),
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

export function useConversations(opts?: { background?: boolean }) {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const canDm = useDmCapable();
  // A provider wallet (Qwalla) signs EVERY messenger read, which pops a wallet
  // approval. `background` usage (the always-mounted nav unread badge) must NOT
  // fetch for provider wallets — otherwise Qwalla prompts for a signature on
  // every page load (it reloads the page each time you return to it). We only
  // do the signed read for them when the user actively opens Messages. Local
  // wallets sign silently in-page, so they're unaffected either way.
  const enabled = !!wallet && canDm && !(isExtensionWallet && opts?.background);
  return useQuery({
    queryKey: ["conversations", publicKey],
    enabled,
    // Never background-poll provider wallets (each poll = an approval prompt);
    // fetch once on open. Local wallets sign silently, so keep them live.
    refetchInterval: isExtensionWallet ? false : 15_000,
    // Don't retry-storm the wallet with sign prompts if a signed read fails.
    retry: false,
    queryFn: () =>
      isExtensionWallet
        ? (extSigner.messengerListConversations(publicKey) as Promise<MessengerConversation[]>)
        : rc().messenger.getConversations(wallet!),
  });
}

/** Total unread messages across conversations (0 when none / not loaded). Runs
 *  in BACKGROUND mode so a provider wallet's nav badge never triggers a signed
 *  read (and thus a wallet popup) on every page load. */
export function useUnreadCount(): number {
  const { data } = useConversations({ background: true });
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
      // 1:1 DMs use Qwalla's native message format so they're cross-readable with
      // Qwalla's Chats; group threads keep the v1 multi-recipient envelope.
      const others = recips.filter((r) => r.id !== publicKey);
      const envelope =
        others.length === 1
          ? await encryptMessage(body, others[0].kemPublicKeyHex, kem.publicKeyHex)
          : await encryptForRecipients(body, recips);
      const res = isExtensionWallet
        ? await extSigner.messengerSendMessage(publicKey, conversationId, envelope)
        : await rc().messenger.sendMessage(wallet, conversationId, envelope, {
            messageType: "text",
          });
      if (!res.success) throw new Error(res.error || "Send failed");
      return res;
    },
    onSuccess: (res, variables) => {
      // Optimistically append the sent message so it shows instantly. Critically,
      // for a PROVIDER wallet we must NOT invalidate/refetch here — every read is
      // a signed request (a wallet approval prompt), so a post-send refetch hangs
      // the thread (the "freeze": you had to leave and re-open to see the message).
      // Local wallets read silently, so they still refetch to reconcile.
      const data = (res as { data?: { message?: { id?: string }; id?: string } }).data;
      const msgId = data?.message?.id ?? data?.id ?? `tmp-${Date.now()}`;
      client.setQueryData<DecryptedMessage[]>(
        ["messages", conversationId, publicKey],
        (old = []) => {
          if (old.some((m) => m.id === msgId)) return old;
          const optimistic = {
            id: msgId,
            conversation_id: conversationId,
            sender_wallet_id: publicKey,
            encrypted_content: "",
            signature: "",
            self_destruct: false,
            created_at: Date.now(),
            is_read: true,
            message_type: "text",
            spoiler: false,
            text: variables.trim(),
            mine: true,
          } as DecryptedMessage;
          return [...old, optimistic];
        },
      );
      if (!isExtensionWallet) {
        client.invalidateQueries({ queryKey: ["messages", conversationId, publicKey] });
        client.invalidateQueries({ queryKey: ["conversations", publicKey] });
      }
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

/**
 * Reply to a story as a private E2E DM to its author. Finds or creates the 1:1
 * conversation, encrypts to both parties, and sends — the same machinery as the
 * Messages composer, but callable in one shot from the story viewer.
 */
export function useSendStoryReply() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const { data: kem } = useMyKem();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ authorPubkey, text }: { authorPubkey: string; text: string }) => {
      if (!wallet || !kem) throw new Error("Messaging isn't available on this wallet.");
      const body = text.trim();
      if (!body) throw new Error("Empty message");
      if (authorPubkey === publicKey) throw new Error("That's your own story.");

      const dir = (await rc().messenger.getWallets().catch(() => [] as MessengerWallet[])).map(
        normWallet,
      );
      const author = dir.find((w) => w.id === authorPubkey);
      if (!author?.encryptionPublicKey) {
        throw new Error("They haven't enabled messaging yet.");
      }

      // Find an existing 1:1 conversation, else create one (mirrors
      // useStartConversation: the node may return the id or dedupe existing).
      const participants = [publicKey, authorPubkey];
      const existing = (
        isExtensionWallet
          ? ((await extSigner.messengerListConversations(publicKey)) as MessengerConversation[])
          : await rc().messenger.getConversations(wallet)
      ).find((c) => {
        const members = convoParticipants(c);
        return participants.every((p) => members.includes(p)) && members.length === 2;
      });

      let conversationId = existing?.id;
      if (!conversationId) {
        const res = isExtensionWallet
          ? await extSigner.messengerCreateConversation(publicKey, participants, false)
          : await rc().messenger.createConversation(wallet, participants, { isGroup: false });
        if (!res.success) throw new Error(res.error || "Could not start conversation");
        const data = (res.data ?? {}) as {
          conversationId?: string;
          id?: string;
          conversation?: { id?: string };
        };
        conversationId = data.conversationId || data.id || data.conversation?.id;
        if (!conversationId) {
          const convos = isExtensionWallet
            ? ((await extSigner.messengerListConversations(publicKey)) as MessengerConversation[])
            : await rc().messenger.getConversations(wallet);
          conversationId = convos.find((c) => {
            const m = convoParticipants(c);
            return participants.every((p) => m.includes(p));
          })?.id;
        }
        if (!conversationId) throw new Error("Conversation created, but no id was returned.");
      }

      const envelope = await encryptForRecipients(body, [
        { id: publicKey, kemPublicKeyHex: kem.publicKeyHex },
        { id: authorPubkey, kemPublicKeyHex: author.encryptionPublicKey },
      ]);
      const send = isExtensionWallet
        ? await extSigner.messengerSendMessage(publicKey, conversationId, envelope)
        : await rc().messenger.sendMessage(wallet, conversationId, envelope, { messageType: "text" });
      if (!send.success) throw new Error(send.error || "Send failed");
      return { conversationId };
    },
    onSuccess: () => {
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

      // Reuse an existing thread with this exact participant set instead of
      // minting another one — the node doesn't dedupe, so creating every time
      // is what scatters a pair across many "Encrypted conversation" rows.
      const want = [...participants].sort().join(",");
      const existing = (
        isExtensionWallet
          ? ((await extSigner.messengerListConversations(publicKey)) as MessengerConversation[])
          : await rc().messenger.getConversations(wallet)
      ).find((c) => [...convoParticipants(c)].sort().join(",") === want);
      if (existing?.id) return existing.id;

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
        id = convos.find((c) => {
          const m = convoParticipants(c);
          return recips.every((r) => m.includes(r));
        })?.id;
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
  const others = convoParticipants(c).filter((p) => p !== opts.publicKey);
  const isGroup = others.length > 1;
  const otherId = others[0];
  if (!isGroup && otherId && opts.blocked.has(otherId)) return "blocked";
  if (opts.accepted.has(c.id)) return "primary";
  if (isGroup) return "primary"; // group threads aren't gated for now
  if (otherId && opts.following.has(otherId)) return "primary"; // people you follow are trusted
  return "request";
}

/** Split conversations into Primary and Requests using the follow graph + gate. */
/** Stable key for a conversation's participant SET (self excluded), so repeated
 *  1:1s (or identical groups) with the same people collapse to one row. */
function participantKey(c: MessengerConversation, publicKey: string): string {
  return convoParticipants(c)
    .filter((p) => p !== publicKey)
    .sort()
    .join(",");
}

const convoTime = (c: MessengerConversation): number =>
  toMs(c.last_message_at ?? c.created_at);

/**
 * Collapse duplicate conversations with the same participant set into one row.
 * The node mints a fresh conversation id on every "start" (from either side), so
 * a pair can accumulate several 1:1 records; showing them all is the "glitch".
 * We keep the most-recently-active as the representative and sum unread counts.
 */
function collapseConversations(
  convos: MessengerConversation[],
  publicKey: string,
): MessengerConversation[] {
  const groups = new Map<string, MessengerConversation[]>();
  for (const c of convos) {
    const k = participantKey(c, publicKey);
    const arr = groups.get(k);
    if (arr) arr.push(c);
    else groups.set(k, [c]);
  }
  const out: MessengerConversation[] = [];
  for (const arr of groups.values()) {
    const rep = arr.reduce((a, b) => (convoTime(b) > convoTime(a) ? b : a));
    const unread = arr.reduce((s, c) => s + (c.unread_count ?? 0), 0);
    out.push(unread !== (rep.unread_count ?? 0) ? { ...rep, unread_count: unread } : rep);
  }
  return out.sort((a, b) => convoTime(b) - convoTime(a));
}

export function useConversationBuckets() {
  const { publicKey } = useAuth();
  const convos = useConversations();
  const gate = useDmGate();
  const { data: followingList } = useFollowing(publicKey || undefined);
  const following = useMemo(() => new Set(followingList ?? []), [followingList]);

  const { primary, requests } = useMemo(() => {
    const primary: MessengerConversation[] = [];
    const requests: MessengerConversation[] = [];
    // Group first so a person's duplicate threads share one classification: if
    // ANY duplicate was accepted/trusted, the whole group is primary (else a
    // stray accepted dup would leave siblings stuck in Requests).
    const raw = convos.data ?? [];
    const byKey = new Map<string, MessengerConversation[]>();
    for (const c of raw) {
      const k = participantKey(c, publicKey);
      (byKey.get(k) ?? byKey.set(k, []).get(k)!).push(c);
    }
    for (const rep of collapseConversations(raw, publicKey)) {
      const group = byKey.get(participantKey(rep, publicKey)) ?? [rep];
      const buckets = group.map((c) =>
        classifyConversation(c, { publicKey, following, accepted: gate.accepted, blocked: gate.blocked }),
      );
      if (buckets.includes("blocked")) continue;
      if (buckets.includes("primary")) primary.push(rep);
      else requests.push(rep);
    }
    return { primary, requests };
  }, [convos.data, publicKey, following, gate.accepted, gate.blocked]);

  return { primary, requests, isLoading: convos.isLoading, gate };
}
