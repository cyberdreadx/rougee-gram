import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Languages, Loader2 } from "lucide-react";
import { translateText, translateEnabled, languageName } from "@/lib/translate";

/**
 * "See translation" control for a post's caption / text. Translates into the
 * viewer's app language on demand (Workers AI, cached server-side) and toggles
 * between the translation and the original. Renders nothing when translation
 * isn't configured or there's no text.
 */
export default function TranslateText({ text, className }: { text: string; className?: string }) {
  const { i18n } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  if (!translateEnabled() || !text.trim()) return null;

  const target = languageName(i18n.resolvedLanguage || i18n.language || "en");

  const run = async () => {
    if (result) {
      setShown(true);
      return;
    }
    setLoading(true);
    setError(false);
    const out = await translateText(text, target);
    setLoading(false);
    if (out && out !== text) {
      setResult(out);
      setShown(true);
    } else if (out === text) {
      setResult(text); // already in the viewer's language
      setShown(true);
    } else {
      setError(true);
    }
  };

  return (
    <div className={className}>
      {shown && result ? (
        <>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{result}</p>
          <button
            onClick={() => setShown(false)}
            className="mt-0.5 text-xs font-medium text-ink-muted hover:text-white"
          >
            Show original
          </button>
        </>
      ) : (
        <button
          onClick={run}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs font-medium text-rouge-400 hover:underline disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Languages className="h-3 w-3" />}
          {error ? "Translation unavailable" : loading ? "Translating…" : "See translation"}
        </button>
      )}
    </div>
  );
}
