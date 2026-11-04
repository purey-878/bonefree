import type { SupportedLocale } from '../i18n';

export type CatalogLocale = SupportedLocale;
export type TranslationLocale = Exclude<CatalogLocale, 'pt-PT'>;
export interface CatalogText { name?: string | null; description?: string | null; menuTags?: string | null; }
export type CatalogTranslations = Partial<Record<TranslationLocale, CatalogText | null>>;

export function catalogText(original: CatalogText, translations: CatalogTranslations | undefined, locale: CatalogLocale): CatalogText {
  return locale === 'pt-PT' ? original : translations?.[locale] ?? {};
}

/** A supplied locale replaces its overrides; an empty locale explicitly clears them. */
export function editCatalogTranslation(translations: CatalogTranslations | undefined, locale: TranslationLocale, field: keyof CatalogText, value: string): CatalogTranslations {
  const next = { ...translations?.[locale], [field]: value };
  return { ...translations, [locale]: Object.values(next).some(text => text?.trim()) ? next : null };
}
