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
}

export function getProvider(): RougeChainProvider | null {
  const p = (window as unknown as { rougechain?: RougeChainProvider }).rougechain;
  return p?.isRougeChain ? p : null;
}

/** Extensions only exist in desktop browsers. */
export function extensionAvailable(): boolean {
  return typeof window !== "undefined" && !!getProvider();
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

// ── Value transfer (tips) ──
export const transfer = (pk: string, to: string, amount: number, token = "XRGE") =>
  signAndSubmit("/v2/transfer", { type: "transfer", to, amount, fee: 1, token }, pk);
