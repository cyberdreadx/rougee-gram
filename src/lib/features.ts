/**
 * Feature flags. Flip to re-enable — the feature's code is kept intact, only its
 * entry points are gated.
 */

/**
 * Direct messages. Disabled for now: the messenger works, but signed reads prompt
 * the wallet on provider (Qwalla) accounts, and a safe silent-read path needs a
 * node-side `action:"read"` domain separator (see docs). Re-enable by flipping to
 * true once that lands. Hides the Messages nav/header entries, the /messages
 * routes, the profile Message button, and the story-reply composer.
 */
export const DMS_ENABLED = false;

/**
 * "Liked by … and others" social-proof facepile under a post. Disabled until the
 * node exposes a who-liked endpoint — the likes are already stored per-liker
 * (`social_likes` tree, keyed `{postId}:{liker}`), but no route lists them yet.
 *
 * TODO(backend) to enable:
 *   1. node storage (core/storage/src/social_store.rs): add
 *        pub fn get_post_likers(&self, track_id: &str, limit: usize) -> Result<Vec<String>, String>
 *      mirroring get_user_likes but scanning likes_tree with prefix `"{track_id}:"`
 *      and stripping it to yield liker pubkeys. (Order is by key, not recency —
 *      store a timestamp in the like value instead of b"1" if recency is wanted.)
 *   2. node (core/daemon/src/node.rs): social_get_post_likers(track_id, limit) wrapper.
 *   3. daemon route (core/daemon/src/main.rs):
 *        .route("/api/social/post/:postId/likers", get(social_post_likers))
 *      returning { likers: string[], total: number } (total = get_like_count).
 *   4. @rougechain/sdk SocialClient:
 *        getPostLikers(postId, limit = 3): Promise<{ likers: string[]; total: number }>
 *          => rc.get(`/social/post/${postId}/likers?limit=${limit}`)
 *   5. Flip this to true. (usePostLikers already calls the route directly; swap it
 *      to rc().social.getPostLikers once the SDK method ships.)
 *
 * Until then usePostLikers is disabled → LikedByRow renders nothing. We never
 * fabricate likers.
 */
export const LIKERS_ENABLED = false;
