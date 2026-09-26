/**
 * RougeChain browser-extension signing bridge (desktop only).
 *
 * When a user connects via the RougeChain extension, the private key stays inside
 * the extension. We build the same v2 payloads the SDK builds, route signing
 * through window.rougechain.signTransaction(), and submit via rc().submitTx so
 * response parsing matches the rest of the app. Adapted from qRougee.
 */
import type { SignedTransaction } from "@rougechain/sdk";
import { rc } from "./rouge";

interface Payload {
  [key: string]: unknown;
  from: string;
  timestamp: number;
  nonce: string;
}
interface ExtensionSignResult {
  signature?: string;
  payload?: Payload;
  public_key?: string;
}
interface RougeChainProvider {
  isRougeChain?: boolean;
  connect(): Promise<{ publicKey: string }>;
  signTransaction(payload: Payload): Promise<ExtensionSignResult>;
  /** KEM bridge (Qwalla/extension): the wallet's DM encryption public key. */
  getEncryptionPublicKey?(): Promise<{ encryptionPublicKey: string } | string>;
  /** KEM bridge: decrypt a RouGee DM envelope; returns plaintext only. */
  decrypt?(params: { envelope: string; myId: string }): Promise<{ plaintext: string } | string>;
  /** The wallet's currently-selected network (so the dApp can follow it). */
  getNetwork?(): Promise<{ network?: string; api?: string; label?: string }>;
  /** Live provider events (Qwalla emits 'networkChanged' when the user switches). */
  on?(event: string, cb: (data: unknown) => void): void;
  removeListener?(event: string, cb: (data: unknown) => void): void;
}

export function getProvider(): RougeChainProvider | null {
  const p = (window as unknown as { rougechain?: RougeChainProvider }).rougechain;
  return p?.isRougeChain ? p : null;
}

/** Extensions only exist in desktop browsers. */
export function extensionAvailable(): boolean {
  return typeof window !== "undefined" && !!getProvider();
}

export type Host = "qwalla" | "extension" | "browser";

/**
 * Identify the runtime host so login can label the connect flow correctly.
 *
 * Qwalla's in-app dApp browser injects the SAME `window.rougechain` provider
 * (`isRougeChain: true`, connect/signTransaction) as the desktop RougeChain
 * extension — so both look identical to `getProvider()`. The tie-breaker is the
 * React-Native WebView bridge (`window.ReactNativeWebView`), which Qwalla's
 * provider uses to talk to native and which a desktop extension never has.
 */
export function detectHost(): Host {
  if (typeof window === "undefined") return "browser";
  const w = window as unknown as {
    rougechain?: RougeChainProvider;
    ReactNativeWebView?: unknown;
  };
  if (w.rougechain?.isRougeChain) {
    return w.ReactNativeWebView ? "qwalla" : "extension";
  }
  return "browser";
}

/** The host wallet's active network (id + node api URL), if it exposes one. */
export async function getProviderNetwork(): Promise<{ network: string; api: string } | null> {
  const p = getProvider();
  if (!p?.getNetwork) return null;
  try {
    const r = await p.getNetwork();
    if (r && typeof r.network === "string" && typeof r.api === "string") {
      return { network: r.network, api: r.api };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Subscribe to the wallet switching networks while RouGee is open. Qwalla emits
 * `networkChanged` with `{ network, api }` from its dApp bridge, so RouGee can
 * retarget its API without a reconnect. Returns an unsubscribe function (a no-op
 * if the provider doesn't support events).
 */
export function onProviderNetworkChange(
  cb: (net: { network: string; api: string }) => void,
): () => void {
  const p = getProvider();
  if (!p?.on) return () => {};
  const handler = (data: unknown) => {
    const d = data as { network?: unknown; api?: unknown } | null;
    if (d && typeof d.network === "string" && typeof d.api === "string") {
      cb({ network: d.network, api: d.api });
    }
  };
  p.on("networkChanged", handler);
  return () => p.removeListener?.("networkChanged", handler);
}

/** Connect on a user gesture; returns the account public key. */
export async function connect(): Promise<string> {
  const provider = getProvider();
  if (!provider) throw new Error("RougeChain extension not found.");
  const res = await provider.connect();
  if (!res?.publicKey) throw new Error("Extension did not return an account.");
  return res.publicKey;
}

function nonce(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function signAndSubmit(
  endpoint: string,
  fields: Record<string, unknown>,
  publicKey: string,
) {
  const provider = getProvider();
  if (!provider) throw new Error("RougeChain extension not available.");
  const payload: Payload = {
    ...fields,
    from: publicKey,
    timestamp: Date.now(),
    nonce: nonce(),
  };
  let result: ExtensionSignResult;
  try {
    result = await provider.signTransaction(payload);
  } catch (e) {
    throw new Error(
      `Signing rejected: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  if (!result?.signature) {
    throw new Error("Wallet did not return a signature — was it approved?");
  }
  // Submit the exact payload/key the extension signed (it may normalize fields);
  // the node re-serializes canonically and verifies ML-DSA-65.
  const signedTx = {
    payload: result.payload ?? payload,
    signature: result.signature,
    public_key: result.public_key ?? publicKey,
  } as unknown as SignedTransaction;
  return rc().submitTx(endpoint, signedTx);
}

// ── Social writes (mirror @rougechain/sdk SocialClient field names) ──
export const socialCreatePost = (pk: string, body: string, replyToId?: string) =>
  signAndSubmit("/v2/social/post", replyToId ? { body, replyToId } : { body }, pk);

export const socialToggleLike = (pk: string, postId: string) =>
  signAndSubmit("/v2/social/like", { trackId: postId }, pk);

export const socialToggleRepost = (pk: string, postId: string) =>
  signAndSubmit("/v2/social/repost", { postId }, pk);

export const socialToggleFollow = (pk: string, artistPubkey: string) =>
  signAndSubmit("/v2/social/follow", { artistPubkey }, pk);

export const socialDeletePost = (pk: string, postId: string) =>
  signAndSubmit("/v2/social/post/delete", { postId }, pk);

// ── Username registry (mirrors @rougechain/sdk registerName/releaseName) ──
export const registerName = (pk: string, name: string) =>
  signAndSubmit("/v2/names/register", { name, walletId: pk }, pk);

export const releaseName = (pk: string, name: string) =>
  signAndSubmit("/v2/names/release", { name }, pk);

// ── Value transfer (tips) ──
export const transfer = (pk: string, to: string, amount: number, token = "XRGE") =>
  signAndSubmit("/v2/transfer", { type: "transfer", to, amount, fee: 1, token }, pk);

// ── KEM bridge for E2E DMs (Qwalla/extension) ─────────────────────────────────
// A provider wallet never exposes its seed, so the KEM key can't be derived here.
// When the provider advertises the bridge, RouGee gets its DM public key from it
// and delegates decryption to it (plaintext-only), keeping the seed in the wallet.

/** True when the connected provider can serve the DM key bridge. */
export function supportsKemBridge(): boolean {
  const p = getProvider();
  return !!(p && typeof p.getEncryptionPublicKey === "function" && typeof p.decrypt === "function");
}

/** The provider wallet's ML-KEM public key (hex) for DMs. */
export async function getEncryptionPublicKey(): Promise<string> {
  const p = getProvider();
  if (!p?.getEncryptionPublicKey) throw new Error("Wallet can't provide an encryption key.");
  const r = await p.getEncryptionPublicKey();
  const hex = typeof r === "string" ? r : r?.encryptionPublicKey;
  if (!hex) throw new Error("Wallet did not return an encryption key.");
  return hex;
}

/** Decrypt a RouGee DM envelope addressed to `myId` via the provider. */
export async function kemDecrypt(envelope: string, myId: string): Promise<string> {
  const p = getProvider();
  if (!p?.decrypt) throw new Error("Wallet can't decrypt messages.");
  const r = await p.decrypt({ envelope, myId });
  const txt = typeof r === "string" ? r : r?.plaintext;
  if (typeof txt !== "string") throw new Error("Wallet returned no plaintext.");
  return txt;
}

/** Sign a read request via the provider and POST it (list endpoints return data
 *  directly, not the submitTx {success,…} envelope). */
async function signAndPost(
  endpoint: string,
  fields: Record<string, unknown>,
  publicKey: string,
): Promise<Record<string, unknown>> {
  const provider = getProvider();
  if (!provider) throw new Error("RougeChain wallet not available.");
  const payload: Payload = { ...fields, from: publicKey, timestamp: Date.now(), nonce: nonce() };
  // NOTE: these are read requests, but they're signed via the normal (prompting)
  // signTransaction path on purpose. A "silent read-signing" shortcut is UNSAFE
  // with the current node: read and destructive payloads are byte-identical
  // (e.g. getMessages and deleteConversation both sign just { conversationId }),
  // so a silent read-signature is a valid delete request. Fixing that needs
  // domain separation in the SIGNED payload (an `action:'read'` the node enforces),
  // not a client-side field allowlist. Until then we prompt (reads are cached
  // ~10min to keep prompts rare).
  const result = await provider.signTransaction(payload);
  if (!result?.signature) throw new Error("Wallet did not return a signature.");
  const signedTx = {
    payload: result.payload ?? payload,
    signature: result.signature,
    public_key: result.public_key ?? publicKey,
  };
  const client = rc() as unknown as { post(p: string, b: unknown): Promise<Record<string, unknown>> };
  return client.post(endpoint, signedTx);
}

// ── Messenger writes (mirror @rougechain/sdk MessengerClient payloads) ──
export const messengerRegister = (
  pk: string,
  opts: { id: string; displayName: string; signingPublicKey: string; encryptionPublicKey: string; discoverable?: boolean },
) =>
  signAndSubmit(
    "/v2/messenger/wallets/register",
    {
      id: opts.id,
      displayName: opts.displayName,
      signingPublicKey: opts.signingPublicKey,
      encryptionPublicKey: opts.encryptionPublicKey,
      discoverable: opts.discoverable ?? true,
    },
    pk,
  );

export const messengerCreateConversation = (
  pk: string,
  participantIds: string[],
  isGroup: boolean,
  name?: string,
) =>
  signAndSubmit(
    "/v2/messenger/conversations",
    { participantIds, isGroup, ...(name ? { name } : {}) },
    pk,
  );

export const messengerSendMessage = (
  pk: string,
  conversationId: string,
  encryptedContent: string,
  messageType = "text",
) =>
  signAndSubmit(
    "/v2/messenger/messages",
    { conversationId, encryptedContent, contentSignature: "", messageType, selfDestruct: false, spoiler: false },
    pk,
  );

export const messengerMarkRead = (pk: string, messageId: string, conversationId: string) =>
  signAndSubmit("/v2/messenger/messages/read", { messageId, conversationId }, pk);

export const messengerDeleteMessage = (pk: string, messageId: string, conversationId: string) =>
  signAndSubmit("/v2/messenger/messages/delete", { messageId, conversationId }, pk);

export const messengerDeleteConversation = (pk: string, conversationId: string) =>
  signAndSubmit("/v2/messenger/conversations/delete", { conversationId }, pk);

// ── Messenger reads (POST list endpoints) ──
export const messengerListConversations = (pk: string) =>
  signAndPost("/v2/messenger/conversations/list", {}, pk).then(
    (d) => (d.conversations as unknown[]) ?? [],
  );

export const messengerListMessages = (pk: string, conversationId: string) =>
  signAndPost("/v2/messenger/messages/list", { conversationId }, pk).then(
    (d) => (d.messages as unknown[]) ?? [],
  );
