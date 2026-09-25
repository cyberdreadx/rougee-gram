import { Link } from "react-router-dom";
import { HASHTAG_RE } from "@/lib/discover";

/**
 * Renders post text with #hashtags linkified to their tag page. Splitting on a
 * capturing regex keeps the tags as their own segments. Non-tag text is emitted
 * verbatim (whitespace/newlines preserved by the caller's `whitespace-pre-wrap`).
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
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}
