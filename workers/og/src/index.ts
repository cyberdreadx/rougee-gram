/**
 * RouGee per-post Open Graph image.
 *
 * GET /p/:postId[?network=mainnet]  ->  image/png (1200x630)
 *
 * Shows the post's first photo BLURRED behind a "Make a RouGee account to view
 * this photo" call-to-action, so a link shared off-platform teases the content
 * without revealing it. The blur is an SVG Gaussian filter rasterised by resvg,
 * so it's applied deterministically on our side — the full-resolution photo is
 * never sent to the crawler, even if Cloudflare image-resizing is unavailable.
 */
import { Resvg, initWasm } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import fontTtf from "./font.ttf";
import { RougeChain } from "@rougechain/sdk";

export interface Env {
  NODE_TESTNET: string;
  NODE_MAINNET: string;
  CF_MEDIA: string;
  IPFS_GATEWAY?: string;
}

// resvg wasm must be initialised exactly once per isolate.
let wasmReady: Promise<unknown> | null = null;
const ensureWasm = () => (wasmReady ??= initWasm(resvgWasm));

function nodeFor(env: Env, network: string): string {
  return (network === "testnet" ? env.NODE_TESTNET : env.NODE_MAINNET).replace(/\/$/, "");
}

/** Resolve a media ref (cf:/ipfs://) to a public URL, mirroring the app. */
function resolveRef(env: Env, ref: string | undefined | null): string | null {
  if (!ref) return null;
  if (/^https?:\/\//.test(ref) || ref.startsWith("data:")) return ref;
  if (ref.startsWith("cf:")) return `${env.CF_MEDIA.replace(/\/+$/, "")}/f/${ref.slice(3)}`;
  if (ref.startsWith("ipfs://")) return `${(env.IPFS_GATEWAY || "https://ipfs.io/ipfs/")}${ref.slice(7)}`;
  return null;
}

/** First image media ref in a decoded post body (envelope JSON). */
function firstImageRef(body: string): string | null {
  try {
    const d = JSON.parse(body) as {
      t?: string;
      cid?: string;
      poster?: string;
      items?: { cid?: string }[];
    };
    if (d.t === "photo") return d.cid ?? null;
    if (d.t === "carousel") return d.items?.[0]?.cid ?? null;
    if (d.t === "video" || d.t === "story") return d.poster ?? null;
    return null;
  } catch {
    return null;
  }
}

function base64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(s);
}

const CARD = (bgDataUri: string | null) => `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="30" />
    </filter>
  </defs>
  ${
    bgDataUri
      ? `<image href="${bgDataUri}" x="0" y="0" width="1200" height="630" preserveAspectRatio="xMidYMid slice" filter="url(#blur)" />`
      : `<rect width="1200" height="630" fill="#140a22" />`
  }
  <rect width="1200" height="630" fill="#0a0814" opacity="0.58" />
  <text x="600" y="232" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="42" letter-spacing="7" fill="#c084fc">ROUGEE</text>
  <g transform="translate(570,286)">
    <rect x="0" y="34" width="60" height="48" rx="9" fill="#ffffff" />
    <path d="M11 34 V22 a19 19 0 0 1 38 0 V34" fill="none" stroke="#ffffff" stroke-width="8" />
    <rect x="26" y="50" width="8" height="18" rx="4" fill="#140a22" />
  </g>
  <text x="600" y="462" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="58" fill="#ffffff">Make a RouGee account</text>
  <text x="600" y="532" text-anchor="middle" font-family="Poppins" font-weight="700" font-size="58" fill="#ffffff">to view this photo</text>
</svg>`;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/p\/([^/]+)/);
    if (!match) return new Response("not found", { status: 404 });
    const postId = match[1];
    const network = url.searchParams.get("network") || "mainnet";

    // Look up the post's first image.
    let bgDataUri: string | null = null;
    try {
      const rc = new RougeChain(nodeFor(env, network));
      const r = (await rc.social.getPost(postId)) as { post?: { body?: string } };
      const imgUrl = resolveRef(env, firstImageRef(r?.post?.body ?? ""));
      if (imgUrl) {
        // Best-effort downscale (ignored if image-resizing isn't enabled — the
        // SVG blur below is what actually hides the content either way).
        const resp = await fetch(imgUrl, {
          cf: { image: { width: 800, height: 420, fit: "cover" } },
        } as RequestInit);
        if (resp.ok) {
          const buf = await resp.arrayBuffer();
          if (buf.byteLength > 0 && buf.byteLength < 5_000_000) {
            const ct = resp.headers.get("content-type") || "image/jpeg";
            bgDataUri = `data:${ct};base64,${base64(buf)}`;
          }
        }
      }
    } catch {
      /* fall back to the branded (image-less) card */
    }

    try {
      await ensureWasm();
      const resvg = new Resvg(CARD(bgDataUri), {
        fitTo: { mode: "width", value: 1200 },
        font: {
          fontBuffers: [new Uint8Array(fontTtf)],
          defaultFontFamily: "Poppins",
          loadSystemFonts: false,
        },
      });
      const png = resvg.render().asPng();
      return new Response(png, {
        headers: {
          "content-type": "image/png",
          "cache-control": "public, max-age=3600, s-maxage=86400",
          "access-control-allow-origin": "*",
        },
      });
    } catch (e) {
      return new Response(`render error: ${e instanceof Error ? e.message : e}`, { status: 500 });
    }
  },
};
