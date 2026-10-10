import { Link } from "react-router-dom";
import { HASHTAG_RE } from "@/lib/discover";

/** http(s) URLs. Global + capturing so String.split keeps them as segments. */
const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,!?)\]}'"])/g;

/**
 * Renders post text with #hashtags linkified to their tag page and http(s)
 * URLs turned into clickable external links. Splitting on capturing regexes
 * keeps the matches as their own segments; non-match text is emitted verbatim
 * (whitespace/newlines preserved by the caller's `whitespace-pre-wrap`).
 */
export default function RichText({ text }: { text: string }) {
  const parts = text.split(HASHTAG_RE);
  return (
    <>
      {parts.map((part, i) => {
        if (part.length > 1 && part.startsWith("#")) {
          const tag = part.slice(1).toLowerCase();
          return (
            <Link
              key={i}
              to={`/tag/${encodeURIComponent(tag)}`}
              className="text-rouge-400 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </Link>
          );
        }
        return <Linkified key={i} text={part} />;
      })}
    </>
  );
}

/** Splits a plain-text run on URLs and renders them as external links. */
function Linkified({ text }: { text: string }) {
  const segs = text.split(URL_RE);
  return (
    <>
      {segs.map((seg, i) => {
        if (/^https?:\/\//.test(seg)) {
          return (
            <a
              key={i}
              href={seg}
              target="_blank"
              rel="noopener noreferrer"
              className="text-rouge-400 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {seg.replace(/^https?:\/\//, "")}
            </a>
          );
        }
        return <span key={i}>{seg}</span>;
      })}
    </>
  );
}
