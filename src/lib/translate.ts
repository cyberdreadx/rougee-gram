import { getConfig } from "./config";

/**
 * Client calls to the RouGee translation Worker (Workers AI). Translates a
 * post's text into the viewer's language on demand; the Worker caches results,
 * so repeat requests for the same (text, language) are free.
 */

/** App locale code -> English language name the model translates into. */
const LANG_NAMES: Record<string, string> = {
  ar: "Arabic",
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  ja: "Japanese",
  pt: "Portuguese",
  zh: "Chinese",
};

export function languageName(code: string): string {
  return LANG_NAMES[code.split("-")[0]?.toLowerCase()] || "English";
}

export function translateEnabled(): boolean {
  return Boolean(getConfig().translateWorkerUrl);
}

/** Translate `text` into `targetName` (a language name). Null on failure. */
export async function translateText(text: string, targetName: string): Promise<string | null> {
  if (!translateEnabled() || !text.trim()) return null;
  try {
    const base = getConfig().translateWorkerUrl.replace(/\/$/, "");
    const res = await fetch(`${base}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target: targetName }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { text?: string };
    return data.text?.trim() || null;
  } catch {
    return null;
  }
}
