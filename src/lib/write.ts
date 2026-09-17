import type { WalletKeys, ApiResponse, SocialPost } from "@rougechain/sdk";
import { rc } from "./rouge";
import * as ext from "./extensionSigner";

/**
 * Unified social-write dispatch: local-key wallets sign via the SDK, extension
 * wallets route through the RougeChain extension. Both return {success,error,...}.
 */
export interface Writer {
  wallet: WalletKeys | null;
  publicKey: string;
  isExtensionWallet: boolean;
}

/**
 * Create a post (or a reply, when `replyToId` is set). The created post — and
 * crucially its `id` — comes back nested under `data.post` (the node nests write
 * results under `data`; use `newPostId` to read it). Chaining that id into the
 * next `createPost` as `replyToId` is how X-style threads are stitched together.
 */
export function createPost(
  w: Writer,
  body: string,
  replyToId?: string,
): Promise<ApiResponse<{ post?: SocialPost }>> {
  return w.isExtensionWallet
    ? (ext.socialCreatePost(w.publicKey, body, replyToId) as Promise<
        ApiResponse<{ post?: SocialPost }>
      >)
    : (rc().social.createPost(w.wallet!, body, replyToId) as Promise<
        ApiResponse<{ post?: SocialPost }>
      >);
}

/** Extract the new post's id from a createPost response (nested under `data`). */
export function newPostId(res: ApiResponse<{ post?: SocialPost }>): string | undefined {
  return res.data?.post?.id;
}

export function toggleLike(w: Writer, postId: string): Promise<ApiResponse> {
  return w.isExtensionWallet
    ? ext.socialToggleLike(w.publicKey, postId)
    : rc().social.toggleLike(w.wallet!, postId);
}

export function toggleRepost(w: Writer, postId: string): Promise<ApiResponse> {
  return w.isExtensionWallet
    ? ext.socialToggleRepost(w.publicKey, postId)
    : rc().social.toggleRepost(w.wallet!, postId);
}

export function toggleFollow(w: Writer, artistPubkey: string): Promise<ApiResponse> {
  return w.isExtensionWallet
    ? ext.socialToggleFollow(w.publicKey, artistPubkey)
    : rc().social.toggleFollow(w.wallet!, artistPubkey);
}

export function deletePost(w: Writer, postId: string): Promise<ApiResponse> {
  return w.isExtensionWallet
    ? ext.socialDeletePost(w.publicKey, postId)
    : rc().social.deletePost(w.wallet!, postId);
}

/** Tip XRGE to another account (on-chain value transfer). `to` is a rouge address. */
export function tip(w: Writer, to: string, amount: number): Promise<ApiResponse> {
  return w.isExtensionWallet
    ? ext.transfer(w.publicKey, to, amount)
    : rc().transfer(w.wallet!, { to, amount, fee: 1 });
}
