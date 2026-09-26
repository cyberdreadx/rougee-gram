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
