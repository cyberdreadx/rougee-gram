import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import es from "./locales/es.json";
import ja from "./locales/ja.json";
import zh from "./locales/zh.json";
import ar from "./locales/ar.json";
import pt from "./locales/pt.json";
import fr from "./locales/fr.json";
import it from "./locales/it.json";

/**
 * App localization. Interface strings live in ./locales/<lang>.json; user
 * content (captions, posts, DMs) is never translated. English is the source of
 * truth and the fallback — a missing key in another locale falls back to it.
 */
export interface LangMeta {
  code: string;
  /** Endonym — the language's name in itself, for the picker. */
  label: string;
  /** Right-to-left script (Arabic). */
  rtl?: boolean;
}

export const LANGUAGES: LangMeta[] = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "it", label: "Italiano" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
  { code: "ar", label: "العربية", rtl: true },
];

const RTL = new Set(LANGUAGES.filter((l) => l.rtl).map((l) => l.code));

/** Reflect the active language on <html> so CSS + screen readers follow it,
 *  and Arabic renders right-to-left. */
export function applyDocumentLang(lng: string): void {
  const base = (lng || "en").split("-")[0];
  const el = document.documentElement;
  el.lang = base;
  el.dir = RTL.has(base) ? "rtl" : "ltr";
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      ja: { translation: ja },
      zh: { translation: zh },
      ar: { translation: ar },
      pt: { translation: pt },
      fr: { translation: fr },
      it: { translation: it },
    },
    supportedLngs: LANGUAGES.map((l) => l.code),
    fallbackLng: "en",
    // Match "es-MX" -> "es" etc. so a region-tagged browser locale still hits.
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "rougee_lang",
    },
    interpolation: { escapeValue: false },
  });

applyDocumentLang(i18n.language);
i18n.on("languageChanged", applyDocumentLang);

export default i18n;
