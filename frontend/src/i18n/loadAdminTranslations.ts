import i18n, { SUPPORTED_LOCALES } from '.';

let loading: Promise<void> | undefined;

export function loadAdminTranslations(): Promise<void> {
  if (!loading) {
    loading = import('./adminPhrases').then(({ adminPhraseResources, adminLegacyDynamicResources }) => {
      for (const locale of SUPPORTED_LOCALES) {
        i18n.addResourceBundle(locale, 'admin', {
          legacy: adminPhraseResources(locale),
          legacyDynamic: adminLegacyDynamicResources[locale],
        }, true, true);
      }
    }).catch(error => {
      loading = undefined;
      throw error;
    });
  }
  return loading;
}
