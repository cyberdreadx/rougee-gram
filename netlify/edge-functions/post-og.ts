/**
 * Per-post Open Graph tags for shared links.
 *
 * rougee.app is a client-rendered SPA, so every /p/:id request is served the
 * same static index.html — link-preview crawlers (iMessage, WhatsApp, Discord,
 * X, Facebook, Slack) don't run JS, so they'd only ever see the generic site
 * card. This edge function rewrites the <head> for /p/* so each shared post
 * unfurls with a BLURRED teaser image + "Make a RouGee account to view this
 * photo" (image rendered by the rougee-og Worker). Humans still get the normal
 * SPA; we only add meta.
 */
import type { Context, Config } from "@netlify/edge-functions";

const OG_WORKER = "https://rougee-og.rougee.workers.dev";
const TITLE = "Make a RouGee account to view this photo";
const DESC = "Shared via RouGee — your keys, your photos, un-deplatformable.";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export default async (request: Request, context: Context): Promise<Response> => {
  const res = await context.next();
  if (!(res.headers.get("content-type") || "").includes("text/html")) return res;

  const url = new URL(request.url);
  const match = url.pathname.match(/^\/p\/([^/]+)/);
  if (!match) return res;

  const postId = match[1];
  const ogImage = `${OG_WORKER}/p/${encodeURIComponent(postId)}`;
  const pageUrl = `${url.origin}/p/${postId}`;

  let html = await res.text();
  // Drop the static site-wide og:/twitter: tags so ours are unambiguous.
  html = html.replace(/\s*<meta[^>]+(?:property="og:[^"]*"|name="twitter:[^"]*")[^>]*>/g, "");

  const inject = `
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="RouGee" />
    <meta property="og:title" content="${esc(TITLE)}" />
    <meta property="og:description" content="${esc(DESC)}" />
    <meta property="og:url" content="${esc(pageUrl)}" />
    <meta property="og:image" content="${esc(ogImage)}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${esc(TITLE)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(TITLE)}" />
    <meta name="twitter:description" content="${esc(DESC)}" />
    <meta name="twitter:image" content="${esc(ogImage)}" />
  `;
  html = html.replace("</head>", `${inject}</head>`);

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return new Response(html, { status: res.status, headers });
};

export const config: Config = { path: "/p/*" };
