<div align="center">

# Rougee-gram

**A decentralized, un-deplatformable photo network — Instagram, but nobody can shadowban or delete you.**

Built on [RougeChain](https://rougechain.io), a post-quantum Layer 1 blockchain.

</div>

---

## Why this exists

Centralized platforms own your account. They can shadowban you, disable your
business, or delete years of posts with no appeal. Rougee-gram removes the
gatekeeper:

- **Your identity is a key you hold**, not a row in a company database. No email,
  no phone, no sign-up form that can be revoked.
- **Posts, likes, follows and comments live on-chain**, each one signed by you
  with post-quantum cryptography (ML-DSA-65). There's no central moderator with a
  delete button over your account.
- **Photos are content-addressed on IPFS**, so they can't be quietly memory-holed.

If a platform can't identify a central "you" to ban, it can't deplatform you.

## How it works

RougeChain ships a native social layer (posts, timeline, likes, follows,
comments) via [`@rougechain/sdk`](https://www.npmjs.com/package/@rougechain/sdk).
A post's on-chain `body` is plain text (max 4000 chars), so Rougee-gram turns it
into a photo post by storing a compact JSON **envelope** in the body:

```json
{ "v": 1, "t": "photo", "cid": "ipfs://bafy…", "mime": "image/webp", "w": 1440, "h": 1080, "cap": "sunset 🌅" }
```

- The **image** is uploaded to IPFS (or a local IndexedDB fallback in dev) and
  referenced by `cid`.
- **Profiles** (name, bio, avatar) use the same trick with `"t": "profile"` — a
  user's profile is simply their most recent profile-type post. No profile
  database required.

```
┌─────────────┐     signs tx      ┌───────────────┐
│  Your key   │ ────────────────▶ │  RougeChain    │  posts · likes · follows
│ (in-browser)│                   │  social layer  │  comments · timeline
└─────────────┘                   └───────────────┘
       │  uploads image                    ▲
       ▼                                   │ body = {cid, caption, …}
┌─────────────┐                            │
│    IPFS      │ ───────────────────────────┘
│ (Pinata)     │   content-addressed, portable
└─────────────┘
```

## Features

- 🔐 Wallet onboarding — create (24-word recovery phrase) or import; keys
  encrypted at rest with AES-256-GCM (PBKDF2, 600k iterations), decrypted only
  in memory.
- 🚰 Auto-faucet on signup (testnet) so you can post immediately.
- 🏠 Home feed (Following + Discover), Explore grid.
- 📷 Post photos — client-side crop/compress → IPFS → signed on-chain post.
- ❤️ Likes (with double-tap), 💬 threaded comments, 👤 follows.
- 🪪 Editable profile (avatar, name, bio) — published as a signed post.
- ⚙️ Settings — faucet, recovery-phrase/key export, IPFS config, network status.

## Getting started

```bash
npm install
cp .env.example .env      # optional — sensible testnet defaults are built in
npm run dev               # http://localhost:5173
```

By default it connects to the **RougeChain testnet** and stores photos locally
(in your browser). To publish photos to **IPFS**, add a free
[Pinata](https://app.pinata.cloud) JWT — either in `.env` (`VITE_PINATA_JWT`) or
at runtime under **Settings → Photo storage** (no rebuild needed).

### Scripts

| Command             | Description                                            |
| ------------------- | ------------------------------------------------------ |
| `npm run dev`       | Vite dev server                                        |
| `npm run build`     | Typecheck + production build                           |
| `npm run preview`   | Serve the production build                             |
| `npm run typecheck` | Type-check without emitting                            |
| `node scripts/smoke.mjs` | Developer end-to-end check. **Hits the live RougeChain testnet** — generates a throwaway wallet, requests faucet funds, and writes real on-chain posts/likes/comments. Needs network access. |

## Deploy

It's a static SPA, so any static host works. A `netlify.toml` and
`public/_redirects` are included (build `npm run build`, publish `dist`, plus
the SPA catch-all redirect so deep links like `/p/:id` don't 404). See
[`NETLIFY_DEPLOY.md`](./NETLIFY_DEPLOY.md) for the full click-path and one
important note: **don't set `VITE_PINATA_JWT` as a build env var on a public
deploy** — Vite inlines it into the public bundle. Leave it unset and let each
user add their own key in Settings.

## Configuration

| Env var               | Default                              | Purpose                              |
| --------------------- | ------------------------------------ | ------------------------------------ |
| `VITE_ROUGE_API`      | `https://testnet.rougechain.io/api`  | RougeChain API endpoint              |
| `VITE_ROUGE_NETWORK`  | `testnet`                            | Network label shown in the UI        |
| `VITE_PINATA_JWT`     | *(empty → local storage)*            | Enables IPFS uploads                 |
| `VITE_IPFS_GATEWAY`   | `https://gateway.pinata.cloud/ipfs/` | Gateway used to read images          |

Point `VITE_ROUGE_API` at `https://api.rougechain.io/api` for mainnet.

## Tech stack

React + Vite + TypeScript · Tailwind CSS · React Router · TanStack Query ·
`@rougechain/sdk` · IndexedDB (`idb`) for the encrypted keystore & local media.

## Security notes

- Private keys **never leave the browser**; all signing is client-side (ML-DSA-65).
- Keys are stored encrypted; only ciphertext + iv + salt touch disk.
- Lose your recovery phrase and there is **no reset** — that's the point. Back it up.

## License

MIT
