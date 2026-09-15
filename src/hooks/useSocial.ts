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

export const qk = {
  timeline: ["timeline"] as const,
  feed: (pubkey: string) => ["feed", pubkey] as const,
  userPosts: (pubkey: string) => ["userPosts", pubkey] as const,
  post: (id: string) => ["post", id] as const,
  postStats: (id: string, viewer: string) => ["postStats", id, viewer] as const,
  replies: (id: string) => ["replies", id] as const,
  artistStats: (pubkey: string, viewer: string) =>
    ["artistStats", pubkey, viewer] as const,
};

const PAGE = 50;

export function useGlobalTimeline() {
  return useQuery({
    queryKey: qk.timeline,
    queryFn: () => rc().social.getGlobalTimeline(PAGE, 0),
  });
}

export function useFollowingFeed() {
  const { wallet, publicKey } = useAuth();
  return useQuery({
    queryKey: qk.feed(publicKey),
    enabled: Boolean(wallet),
    queryFn: () => rc().social.getFollowingFeed(wallet!, PAGE, 0),
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
  const { wallet, publicKey } = useAuth();
  const client = useQueryClient();
  const key = qk.postStats(postId, publicKey);

  return useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Locked");
      const res = await rc().social.toggleLike(wallet, postId);
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
  const { wallet, publicKey } = useAuth();
  const client = useQueryClient();
  const key = qk.postStats(postId, publicKey);

  return useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Locked");
      const res = await rc().social.toggleRepost(wallet, postId);
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
  const { wallet, publicKey } = useAuth();
  const client = useQueryClient();
  const key = qk.artistStats(pubkey, publicKey);

  return useMutation({
    mutationFn: async () => {
      if (!wallet) throw new Error("Locked");
      const res = await rc().social.toggleFollow(wallet, pubkey);
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

export function useAddComment(postId: string) {
  const { wallet } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      if (!wallet) throw new Error("Locked");
      const body = text.trim().slice(0, 2000);
      if (!body) throw new Error("Empty comment");
      const res = await rc().social.createPost(wallet, body, postId);
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
  const { wallet, publicKey } = useAuth();
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      if (!wallet) throw new Error("Locked");
      const res = await rc().social.deletePost(wallet, postId);
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
        return k !== "profile" && k !== "story";
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
