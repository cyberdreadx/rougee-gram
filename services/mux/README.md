# RouGee mux service

Bakes a reel's chosen qRougee track into the video as **one file**, so playback
is a single media element with one clock — perfect A/V sync, no separate
`<audio>`, no drift. Runs on Fly.io (needs native `ffmpeg`, which Cloudflare
Workers can't run).

## Why synchronous (at post time)

On-chain posts are immutable — you can't edit a post's body later to swap in a
muxed file. So the composer calls this **before** creating the post: it sends the
raw video + the track URL + offsets, gets back a stored media ref, and writes
that ref plus the `mx` flag into the post envelope. If the service is down or
returns an error, the composer silently falls back to the old two-element
(muted video + separate `<audio>`) path — a post is never blocked.

## What it does

`POST /mux` (multipart):

| field | meaning |
| --- | --- |
| `video` | the raw reel file |
| `audioUrl` | the track's https URL (qRougee) |
| `start` | seconds into the track to begin |
| `trimStart` / `trimEnd` | trim the video to this window (baked in) |

ffmpeg copies the video stream (no re-encode), encodes the audio to AAC, seeks
the track to `start`, trims the video, and ends at the shorter of the two
(`-shortest`). The result is stored in R2 via the media Worker's `/upload`
(content-addressed), and the response is:

```json
{ "ref": "cf:media/<sha256>.mp4", "mime": "video/mp4", "bytes": 1234567 }
```

That `ref` goes straight into the video envelope's `cid`.

## Deploy

```sh
cd services/mux
fly launch --no-deploy          # creates the app (or: fly apps create rougee-mux)
fly secrets set \
  MEDIA_WORKER_URL="https://<your-media-worker>" \
  UPLOAD_SECRET="<match the media Worker's UPLOAD_SECRET, if it sets one>"
fly deploy
```

Then point the web app at it:

```
VITE_MUX_WORKER_URL=https://rougee-mux.fly.dev
```

(set in Netlify env, then redeploy). Until that var is set the whole feature is
dormant and reels use the two-element path.

## Env

| var | required | notes |
| --- | --- | --- |
| `MEDIA_WORKER_URL` | yes | base URL of the R2 media Worker (has `/upload`) |
| `UPLOAD_SECRET` | if the media Worker enforces one | sent as `X-Upload-Secret` |
| `ALLOW_ORIGIN` | no | CORS origin, default `*` |
| `PORT` | no | default 8080 |

## Notes / limits

- Reels are capped at ~90s upstream; the request body limit here is 200 MB.
- Video is **copied**, not re-encoded, so muxing is fast and lossless. Crop stays
  a display hint (`crop`) — baking it would force a full video re-encode.
- `-ss` input seeking on a copied stream can start on the nearest keyframe, so a
  trimmed start may be off by a fraction of a second. Acceptable for reels; if it
  ever matters, re-encode the video (`-c:v libx264`) instead of `copy`.
