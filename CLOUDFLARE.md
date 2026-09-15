# Cloudflare R2 media backend

rougee-gram can store images **and video/reels** in your own Cloudflare **R2**
bucket, served through a tiny **Worker** (`workers/media`). R2 is cheap and has
**zero egress fees**, which makes it a great fit for video. It slots in behind
the app's pluggable `MediaStore` and takes priority over IPFS when configured.

```
browser ──POST /upload──▶ Worker ──put──▶ R2 bucket
browser ──GET /f/<key>──▶ Worker ──get (Range)──▶ R2   (video seeking works)
```

Uploads go **through the Worker** (not direct-to-R2) so your R2 credentials
never touch the browser. Objects are content-addressed (key = SHA-256), so the
same file is never stored twice.

## One-time setup

```bash
# 1. Log in to YOUR Cloudflare account (opens a browser).
npx wrangler login

# 2. Create the R2 bucket (requires R2 enabled on your account — free to turn on).
npm run cf:bucket            # = wrangler r2 bucket create rougee-gram-media

# 3. Deploy the Worker.
npm run cf:deploy            # prints https://rougee-gram-media.<you>.workers.dev
```

In this sandboxed session you'd run `npx wrangler login` yourself (type
`! npx wrangler login`) since it needs an interactive browser sign-in. A
`CLOUDFLARE_API_TOKEN` env var works for non-interactive/CI deploys instead.

## Point the app at it

Paste the Worker URL into **Settings → Media storage → Cloudflare R2 → Worker
URL** (stored in your browser only). Or bake it in at build time:

```
VITE_CF_WORKER_URL=https://rougee-gram-media.<you>.workers.dev
```

New uploads now go to R2. The status line in Settings will read
“Cloudflare R2 active”.

## Optional hardening

- **Lock CORS** to your site: edit `ALLOW_ORIGIN` in `workers/media/wrangler.toml`
  (e.g. `https://rougee-gram.netlify.app`) and redeploy.
- **Gate uploads** against spam with a shared secret:
  ```bash
  npx wrangler secret put UPLOAD_SECRET --config workers/media/wrangler.toml
  ```
  then paste the same value into **Settings → Media storage → Upload secret**.
  (On a public site this secret ships in the bundle, so treat it as a soft
  speed-bump; Cloudflare Turnstile is the real fix if abuse becomes a problem.)
- **Custom domain**: bind the Worker to `media.yourdomain.com` in the Cloudflare
  dashboard and use that as the Worker URL.

## Priority

`activeBackend()` picks: **Cloudflare R2** (if Worker URL set) → **IPFS/Pinata**
(if JWT set) → **local IndexedDB** (dev fallback). So configuring Cloudflare
automatically takes over new uploads; existing IPFS/local posts keep resolving.

## Scaling to adaptive streaming

R2 serves progressive MP4 with range requests — perfect for short reels/clips.
For long-form or HD at scale, **Cloudflare Stream** adds transcoding + HLS/DASH
adaptive bitrate + auto thumbnails. That's a future backend (`stream.ts`) behind
the same `MediaStore` interface; it returns an HLS playback URL and would pair
with an HLS player (native in Safari; `hls.js` elsewhere).
