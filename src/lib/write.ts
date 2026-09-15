import type { WalletKeys, ApiResponse } from "@rougechain/sdk";
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

export function createPost(w: Writer, body: string, replyToId?: string): Promise<ApiResponse> {
  return w.isExtensionWallet
    ? ext.socialCreatePost(w.publicKey, body, replyToId)
    : rc().social.createPost(w.wallet!, body, replyToId);
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
