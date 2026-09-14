# Deploying rougee-gram on Netlify

rougee-gram is a 100% client-side Vite + React SPA (no backend). Netlify is a
very good fit. Vercel and Cloudflare Pages work identically; GitHub Pages needs
extra base-path + 404.html hacks, so prefer one of the first three.

## Click-path

**Option A — connect the Git repo (recommended, gives auto-deploy on push):**
1. Netlify dashboard → **Add new site** → **Import an existing project**.
2. Pick GitHub → authorize → select `cyberdreadx/rougee-gram`.
3. Build settings are **auto-detected from `netlify.toml`** (command
   `npm run build`, publish `dist`, Node 20). Leave them as-is.
4. (Optional) set env vars below, then **Deploy site**.

**Option B — drag-and-drop (quick, no auto-deploy):**
1. Run `npm ci && npm run build` locally.
2. Drag the resulting `dist/` folder onto the Netlify **Sites** page.
   (The SPA redirect ships inside `dist/` via `public/_redirects`, so deep
   links still work with this method.)

## Environment variables

Set under **Site configuration → Environment variables**. All are read by
`src/lib/config.ts` through `import.meta.env` and are therefore **inlined into
the public JS bundle at build time** — changing one requires a **redeploy** to
take effect (there is no runtime server to re-read them).

| Variable | Set on Netlify? | Notes |
|---|---|---|
| `VITE_ROUGE_API` | Optional | e.g. `https://api.rougechain.io/api` for mainnet. Public endpoint, safe to inline. Default is testnet. |
| `VITE_ROUGE_NETWORK` | Optional | UI label, e.g. `mainnet`. |
| `VITE_IPFS_GATEWAY` | Optional | Read gateway. Must be **https** (site is HTTPS; http gateways are blocked as mixed content). |
| `VITE_PINATA_JWT` | **NO — leave unset** | See warning below. |

### ⚠️ Do NOT put your Pinata JWT here on a public site

`VITE_PINATA_JWT` is inlined into the public bundle, so it becomes readable by
anyone via view-source. On a public deploy, **leave it blank**. The app boots in
local-IndexedDB mode, and each user can paste their **own** Pinata JWT under
**Settings → Photo storage**, which is stored only in that user's browser
(localStorage) and never enters the bundle. This runtime override always wins
over the build-time value. If you truly must pre-provision IPFS, mint a Pinata
key scoped to `pinFileToIPFS` only and treat it as disposable.

## Browser behavior on a static host (verified)

- **HTTPS**: Netlify auto-provisions TLS. Required, because…
- **WebCrypto** (`crypto.subtle`, wallet AES-GCM/PBKDF2 in `src/lib/crypto.ts`)
  needs a secure context → works on the Netlify HTTPS domain (and localhost).
- **IndexedDB** (`src/lib/db.ts`, local media + keystore fallback): works. Note
  it is per-origin, so a custom domain, a `*.netlify.app` domain, and deploy
  previews each have separate storage; private/incognito windows may evict it.
- **Pinata API** (`api.pinata.cloud`, upload + auth test): CORS-enabled for
  browser `Authorization: Bearer` requests → uploads work with no proxy.
- **IPFS gateway reads**: images load via `<img src>` from the https gateway;
  no CORS or mixed-content issue as long as the gateway is https.
- **Deep links**: handled by the `/*  →  /index.html  200` redirect in
  `netlify.toml` / `public/_redirects`. Without it, refreshing `/p/<id>` or
  `/u/<addr>` 404s.

## Before you push

`npm run build` runs `tsc` first, so **any TypeScript error fails the Netlify
build** even if `npm run dev` worked. Run `npm run build` locally and confirm it
exits 0 before pushing.
