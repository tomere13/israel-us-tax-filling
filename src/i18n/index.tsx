import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { en, type Translations } from "./en";
import { he } from "./he";
import { ru } from "./ru";
import { ar } from "./ar";

export type Locale = "en" | "he" | "ru" | "ar";

const RTL_LOCALES: Locale[] = ["he", "ar"];

const LOCALES: Record<Locale, Translations> = { en, he, ru, ar };

const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  he: "עברית",
  ru: "Русский",
  ar: "العربية",
};

interface I18nCtx {
  locale: Locale;
  t: Translations;
  setLocale: (l: Locale) => void;
  locales: { locale: Locale; label: string }[];
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const saved = localStorage.getItem("locale") as Locale | null;
    return saved && saved in LOCALES ? saved : "en";
  });

  const setLocale = (l: Locale) => {
    localStorage.setItem("locale", l);
    setLocaleState(l);
  };

  useEffect(() => {
    const dir = RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
  }, [locale]);

  const value: I18nCtx = {
    locale,
    t: LOCALES[locale],
    setLocale,
    locales: (Object.keys(LOCALES) as Locale[]).map((l) => ({
      locale: l,
      label: LOCALE_LABELS[l],
    })),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTranslation() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTranslation must be used inside I18nProvider");
  return ctx;
}

/** Replace {key} placeholders in a translation string. */
export function inter(
  template: string,
  params: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in params ? String(params[k]) : `{${k}}`
  );
}
