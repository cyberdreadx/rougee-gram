import { Link } from "react-router-dom";

/**
 * Renders post text with #hashtags, @mentions and http(s) URLs linkified in a
 * single pass. Hashtags link to their tag page, mentions to the handle's
 * profile (/@handle), URLs open externally. Plain text is emitted verbatim
 * (whitespace/newlines preserved by the caller's `whitespace-pre-wrap`).
 */
// #hashtag | @handle (3–20 [a-z0-9_], not after a word char so emails/URLs are
// skipped) | http(s) URL.
const TOKEN_RE =
  /(#[\p{L}\p{N}_]+)|(?<![\w/])@([a-z0-9_]{3,20})(?![a-z0-9_])|(https?:\/\/[^\s<]+[^\s<.,!?)\]}'"])/giu;

type Token =
  | { kind: "text"; value: string }
  | { kind: "tag"; value: string }
  | { kind: "mention"; value: string }
  | { kind: "url"; value: string };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ kind: "text", value: text.slice(last, idx) });
    if (m[1]) out.push({ kind: "tag", value: m[1] });
    else if (m[2]) out.push({ kind: "mention", value: m[2] });
    else if (m[3]) out.push({ kind: "url", value: m[3] });
    last = idx + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

export default function RichText({ text }: { text: string }) {
  return (
    <>
      {tokenize(text).map((tok, i) => {
        if (tok.kind === "tag") {
          return (
            <Link
              key={i}
              to={`/tag/${encodeURIComponent(tok.value.slice(1).toLowerCase())}`}
              className="text-rouge-400 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {tok.value}
            </Link>
          );
        }
        if (tok.kind === "mention") {
          return (
            <Link
              key={i}
              to={`/@${tok.value.toLowerCase()}`}
              className="text-rouge-400 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{tok.value}
            </Link>
          );
        }
        if (tok.kind === "url") {
          return (
            <a
              key={i}
              href={tok.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-rouge-400 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {tok.value.replace(/^https?:\/\//, "")}
            </a>
          );
        }
        return <span key={i}>{tok.value}</span>;
      })}
    </>
  );
}
