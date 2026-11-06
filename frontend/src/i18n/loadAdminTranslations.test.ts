import { describe, expect, it } from 'vitest';
import i18n, { i18nReady, SUPPORTED_LOCALES } from '.';
import { loadAdminTranslations } from './loadAdminTranslations';

describe('administrator translation loading', () => {
  it('keeps admin phrase tables out of startup and registers them before the dashboard opens', async () => {
    await i18nReady;
    expect(i18n.getResource('en-GB', 'admin', 'legacy.browseMenu')).toBeUndefined();
    const first = loadAdminTranslations();
    expect(loadAdminTranslations()).toBe(first);
    await first;
    expect(i18n.getFixedT('en-GB', 'admin')('legacy.browseMenu')).toBe('View menu');
    expect(i18n.getFixedT('pt-PT', 'admin')('legacy.browseMenu')).toBe('Ver menu');
    expect(i18n.getFixedT('de-DE', 'admin')('legacy.browseMenu')).toBe('Speisekarte ansehen');
    for (const locale of SUPPORTED_LOCALES) {
      expect(i18n.getFixedT(locale, 'admin')('legacyDynamic.actionsFor', { name: 'Tofu' })).toContain('Tofu');
      expect(i18n.getResource(locale, 'admin', 'roles.owner')).toBeTruthy();
    }
  });
});
