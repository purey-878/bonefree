import i18n from "i18next"
import LanguageDetector from "i18next-browser-languagedetector"
import { initReactI18next } from "react-i18next"

import deDE from "./locales/de-DE"
import enGB from "./locales/en-GB"
import ptPT from "./locales/pt-PT"
import { adminLegacyDynamicResources, adminPhraseResources } from "./adminPhrases"

export const SUPPORTED_LOCALES = ["pt-PT", "en-GB", "de-DE"] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const LOCALE_STORAGE_KEY = "bonefree_locale"
export const DEFAULT_LOCALE: SupportedLocale = "pt-PT"

export const LOCALE_OPTIONS = [
  { code: "pt-PT", shortCode: "PT", nameKey: "language.portuguese", flag: "pt" },
  { code: "en-GB", shortCode: "EN", nameKey: "language.english", flag: "gb" },
  { code: "de-DE", shortCode: "DE", nameKey: "language.german", flag: "de" },
] as const satisfies ReadonlyArray<{
  code: SupportedLocale
  shortCode: string
  nameKey: string
  flag: "pt" | "gb" | "de"
}>

export function normalizeLocale(value?: string | null): SupportedLocale | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase().replace("_", "-")
  if (normalized === "pt" || normalized.startsWith("pt-")) return "pt-PT"
  if (normalized === "en" || normalized.startsWith("en-")) return "en-GB"
  if (normalized === "de" || normalized.startsWith("de-")) return "de-DE"
  return null
}

export function resolvePreferredLocale(
  storedLocale?: string | null,
  browserLocales: readonly string[] = [],
): SupportedLocale {
  const stored = normalizeLocale(storedLocale)
  if (stored) return stored
  for (const browserLocale of browserLocales) {
    const supported = normalizeLocale(browserLocale)
    if (supported) return supported
  }
  return DEFAULT_LOCALE
}

export function resolvedLocale(): SupportedLocale {
  return normalizeLocale(i18n.resolvedLanguage ?? i18n.language) ?? DEFAULT_LOCALE
}

export const resources = {
  "pt-PT": { ...ptPT, admin: { ...ptPT.admin, legacy: adminPhraseResources("pt-PT"), legacyDynamic: adminLegacyDynamicResources["pt-PT"] } },
  "en-GB": { ...enGB, admin: { ...enGB.admin, legacy: adminPhraseResources("en-GB"), legacyDynamic: adminLegacyDynamicResources["en-GB"] } },
  "de-DE": { ...deDE, admin: { ...deDE.admin, legacy: adminPhraseResources("de-DE"), legacyDynamic: adminLegacyDynamicResources["de-DE"] } },
}

export const i18nReady = i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    supportedLngs: [...SUPPORTED_LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: "common",
    ns: ["common", "storefront", "account", "admin", "errors"],
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: LOCALE_STORAGE_KEY,
      caches: ["localStorage"],
      convertDetectedLanguage: (language) => normalizeLocale(language) ?? language,
    },
    interpolation: { escapeValue: false },
    returnNull: false,
  })

function syncDocumentLanguage(language?: string) {
  if (typeof document !== "undefined") {
    document.documentElement.lang = normalizeLocale(language) ?? DEFAULT_LOCALE
  }
}

syncDocumentLanguage(i18n.resolvedLanguage ?? i18n.language)
i18n.on("languageChanged", syncDocumentLanguage)

export async function changeLocale(locale: SupportedLocale) {
  await i18n.changeLanguage(locale)
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  }
}

export default i18n
