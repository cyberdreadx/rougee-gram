import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { SocialPost, PostStats, ArtistStats } from "@rougechain/sdk";
import { rc } from "@/lib/rouge";
import { useAuth } from "@/store/auth";
import { invalidateProfile } from "@/lib/profile";
import { decodeBody } from "@/lib/envelope";
import * as write from "@/lib/write";
import { recordTip, getPostTips } from "@/lib/tips";

export const qk = {
  timeline: ["timeline"] as const,
  feed: (pubkey: string) => ["feed", pubkey] as const,
  userPosts: (pubkey: string) => ["userPosts", pubkey] as const,
  post: (id: string) => ["post", id] as const,
  postStats: (id: string, viewer: string) => ["postStats", id, viewer] as const,
  replies: (id: string) => ["replies", id] as const,
  artistStats: (pubkey: string, viewer: string) =>
    ["artistStats", pubkey, viewer] as const,
  postTips: (id: string) => ["postTips", id] as const,
};

const PAGE = 50;

export function useGlobalTimeline() {
  return useQuery({
    queryKey: qk.timeline,
    queryFn: () => rc().social.getGlobalTimeline(PAGE, 0),
  });
}

export function useFollowingFeed() {
  const { publicKey } = useAuth();
  return useQuery({
    queryKey: qk.feed(publicKey),
    enabled: Boolean(publicKey),
    // Build the feed CLIENT-SIDE from the follow graph rather than the server
    // `getFollowingFeed` endpoint: that endpoint lags behind new follows and
    // omits followees' older posts, so a freshly-followed user's posts never
    // appear. The on-chain follow list is the source of truth — fan out to each
    // followee's posts and merge. Also works for extension wallets (no privkey).
    queryFn: async (): Promise<SocialPost[]> => {
      const following = await rc().social.getUserFollowing(publicKey);
      const pubkeys = (Array.isArray(following) ? following : []).filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      );
      if (pubkeys.length === 0) return [];
      const perUser = await Promise.all(
        pubkeys.slice(0, 100).map((pk) =>
          rc()
            .social.getUserPosts(pk, 20, 0)
            .then((r) => ((r?.posts ?? []) as SocialPost[]))
            .catch(() => [] as SocialPost[]),
        ),
      );
      const seen = new Set<string>();
      const merged: SocialPost[] = [];
      for (const p of perUser.flat()) {
        if (!p || p.reply_to_id || seen.has(p.id)) continue;
        seen.add(p.id);
        merged.push(p);
      }
      merged.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      return merged.slice(0, PAGE);
    },
  });
}

export function useUserPosts(pubkey: string | undefined) {
  return useQuery({
    queryKey: qk.userPosts(pubkey ?? ""),
    enabled: Boolean(pubkey),
    queryFn: () => rc().social.getUserPosts(pubkey as string, PAGE, 0),
  });
}

export function usePost(postId: string | undefined) {
  const { publicKey } = useAuth();
  return useQuery({
    queryKey: qk.post(postId ?? ""),
    enabled: Boolean(postId),
    queryFn: () => rc().social.getPost(postId as string, publicKey),
  });
}

export function usePostStats(postId: string) {
  const { publicKey } = useAuth();
  return useQuery({
    queryKey: qk.postStats(postId, publicKey),
    queryFn: () => rc().social.getPostStats(postId, publicKey),
    staleTime: 30_000,
  });
}

export function useReplies(postId: string | undefined) {
  return useQuery({
    queryKey: qk.replies(postId ?? ""),
    enabled: Boolean(postId),
    queryFn: () => rc().social.getPostReplies(postId as string, PAGE, 0),
  });
}

export function useArtistStats(pubkey: string | undefined) {
  const { publicKey } = useAuth();
  return useQuery({
    queryKey: qk.artistStats(pubkey ?? "", publicKey),
    enabled: Boolean(pubkey),
    queryFn: () => rc().social.getArtistStats(pubkey as string, publicKey),
    staleTime: 30_000,
  });
}

export function useToggleLike(postId: string) {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  const key = qk.postStats(postId, publicKey);

  return useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Locked");
      const res = await write.toggleLike({ wallet, publicKey, isExtensionWallet }, postId);
      if (!res.success) throw new Error(res.error || "Like failed");
      return res;
    },
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key });
      const prev = client.getQueryData<PostStats>(key);
      if (prev) {
        client.setQueryData<PostStats>(key, {
          ...prev,
          liked: !prev.liked,
          likes: prev.likes + (prev.liked ? -1 : 1),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) client.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: key });
    },
  });
}

export function useToggleRepost(postId: string) {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  const key = qk.postStats(postId, publicKey);

  return useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Locked");
      const res = await write.toggleRepost({ wallet, publicKey, isExtensionWallet }, postId);
      if (!res.success) throw new Error(res.error || "Repost failed");
      return res;
    },
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key });
      const prev = client.getQueryData<PostStats>(key);
      if (prev) {
        client.setQueryData<PostStats>(key, {
          ...prev,
          reposted: !prev.reposted,
          reposts: prev.reposts + (prev.reposted ? -1 : 1),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) client.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: key });
    },
  });
}

export function useToggleFollow(pubkey: string) {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  const key = qk.artistStats(pubkey, publicKey);

  return useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Locked");
      const res = await write.toggleFollow({ wallet, publicKey, isExtensionWallet }, pubkey);
      if (!res.success) throw new Error(res.error || "Follow failed");
      return res;
    },
    onMutate: async () => {
      await client.cancelQueries({ queryKey: key });
      const prev = client.getQueryData<ArtistStats>(key);
      if (prev) {
        client.setQueryData<ArtistStats>(key, {
          ...prev,
          isFollowing: !prev.isFollowing,
          followers: prev.followers + (prev.isFollowing ? -1 : 1),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) client.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      client.invalidateQueries({ queryKey: key });
      client.invalidateQueries({ queryKey: qk.feed(publicKey) });
    },
  });
}

/** Tip XRGE to a rouge address (on-chain transfer). When `postId` is given, the
 *  resulting transfer is recorded as a tip on that post (best-effort, verified
 *  server-side) so the post can show its tip total. */
export function useTip() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({
      to,
      amount,
      postId,
    }: {
      to: string;
      amount: number;
      postId?: string;
    }) => {
      if (!wallet) throw new Error("Locked");
      if (!to) throw new Error("No recipient address");
      if (!(amount > 0)) throw new Error("Enter an amount");
      const res = await write.tip({ wallet, publicKey, isExtensionWallet }, to, amount);
      if (!res.success) throw new Error(res.error || "Tip failed");
      // Attribute the transfer to the post so its tip total reflects it. The
      // node nests the id under `data` for signed writes; tolerate both shapes.
      // Fire-and-forget: the on-chain transfer already succeeded, so recording
      // must not block the UI — refresh the post's total once it lands.
      const txId =
        (res as { txId?: string }).txId ??
        (res as { data?: { txId?: string } }).data?.txId;
      if (postId && txId) {
        void recordTip(postId, txId).then((ok) => {
          if (ok) client.invalidateQueries({ queryKey: qk.postTips(postId) });
        });
      }
      return res;
    },
  });
}

/** Per-post tip total + tippers (from the tips-ledger Worker). */
export function usePostTips(postId: string) {
  return useQuery({
    queryKey: qk.postTips(postId),
    queryFn: () => getPostTips(postId),
    staleTime: 60_000,
  });
}

export function useAddComment(postId: string) {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      if (!wallet) throw new Error("Locked");
      const body = text.trim().slice(0, 2000);
      if (!body) throw new Error("Empty comment");
      const res = await write.createPost({ wallet, publicKey, isExtensionWallet }, body, postId);
      if (!res.success) throw new Error(res.error || "Comment failed");
      return res;
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: qk.replies(postId) });
      client.invalidateQueries({ queryKey: qk.post(postId) });
    },
  });
}

export function useDeletePost() {
  const { wallet, publicKey, isExtensionWallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      if (!wallet) throw new Error("Locked");
      const res = await write.deletePost({ wallet, publicKey, isExtensionWallet }, postId);
      if (!res.success) throw new Error(res.error || "Delete failed");
      return res;
    },
    onSuccess: () => {
      invalidateFeeds(client, publicKey);
    },
  });
}

/** Called after creating a post / editing a profile to refresh feeds. */
export function invalidateFeeds(client: QueryClient, publicKey: string) {
  client.invalidateQueries({ queryKey: qk.timeline });
  client.invalidateQueries({ queryKey: qk.feed(publicKey) });
  client.invalidateQueries({ queryKey: qk.userPosts(publicKey) });
  invalidateProfile(publicKey);
  client.invalidateQueries({ queryKey: ["profile", publicKey] });
}

/** Filter helpers shared by feed views. */
export function isRenderablePost(p: SocialPost): boolean {
  // Hide profile-metadata posts and replies from top-level feeds.
  return !p.reply_to_id;
}

// ===== Social graph & activity =====

export function useFollowing(pubkey: string | undefined) {
  return useQuery({
    queryKey: ["following", pubkey],
    enabled: Boolean(pubkey),
    queryFn: () => rc().social.getUserFollowing(pubkey as string),
    staleTime: 30_000,
  });
}

export function useFollowers(pubkey: string | undefined) {
  return useQuery({
    queryKey: ["followers", pubkey],
    enabled: Boolean(pubkey),
    queryFn: () => rc().social.getUserFollowers(pubkey as string),
    staleTime: 30_000,
  });
}

/** Suggested accounts to follow: active posters on the global timeline, minus
 *  yourself and people you already follow. */
export function useSuggestedUsers(limit = 5): {
  suggestions: string[];
  isLoading: boolean;
} {
  const { publicKey } = useAuth();
  const timeline = useGlobalTimeline();
  const following = useFollowing(publicKey);

  const followingSet = new Set(following.data ?? []);
  const seen = new Set<string>();
  const suggestions: string[] = [];
  for (const p of timeline.data ?? []) {
    const a = p.author_pubkey;
    if (!a || a === publicKey || followingSet.has(a) || seen.has(a)) continue;
    seen.add(a);
    suggestions.push(a);
    if (suggestions.length >= limit) break;
  }
  return { suggestions, isLoading: timeline.isLoading || following.isLoading };
}

export interface ActivityComment {
  post: SocialPost;
  comment: SocialPost;
}
export interface ActivityData {
  comments: ActivityComment[];
  totalLikes: number;
  followers: number;
  postCount: number;
}

/** Your activity: comments on your posts + aggregate like/follower counts.
 *  Note: RougeChain exposes who *commented*, but only counts (not identities)
 *  for likes/follows — so those are shown as totals. */
export function useActivity() {
  const { publicKey } = useAuth();
  return useQuery({
    queryKey: ["activity", publicKey],
    enabled: Boolean(publicKey),
    staleTime: 60_000,
    queryFn: async (): Promise<ActivityData> => {
      const { posts } = await rc().social.getUserPosts(publicKey, 15, 0);
      const mine = posts.filter((p) => {
        if (p.reply_to_id) return false;
        const k = decodeBody(p.body).kind;
        return k !== "profile" && k !== "story" && k !== "note";
      });
      const results = await Promise.all(
        mine.map(async (p) => {
          const [replies, stats] = await Promise.all([
            rc().social.getPostReplies(p.id, 30, 0).catch(() => [] as SocialPost[]),
            rc().social.getPostStats(p.id, publicKey).catch(() => null),
          ]);
          return { post: p, replies, stats };
        }),
      );

      const comments: ActivityComment[] = [];
      let totalLikes = 0;
      for (const r of results) {
        totalLikes += r.stats?.likes ?? 0;
        for (const c of r.replies) {
          if (c.author_pubkey !== publicKey) comments.push({ post: r.post, comment: c });
        }
      }
      comments.sort(
        (a, b) =>
          Date.parse(b.comment.created_at) - Date.parse(a.comment.created_at),
      );

      let followers = 0;
      try {
        followers = (await rc().social.getArtistStats(publicKey, publicKey)).followers;
      } catch {
        /* ignore */
      }

      return { comments, totalLikes, followers, postCount: mine.length };
    },
  });
}
