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
