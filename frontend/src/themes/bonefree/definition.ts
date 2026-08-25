import type { ThemeDefinition } from '../../app/manifest/types'

export const bonefreeTheme: ThemeDefinition = {
  key: 'bonefree',
  supported_modes: ['default', 'presentation'],
  supported_decoration_presets: ['none', 'christmas', 'halloween'],
  default_section_variants: {},
  default_component_variants: {},
  legacy_cache_keys: ['site_theme'],
  refresh_interval_ms: 60000,
  async load_remote_site_theme() {
    return (await import('../../services/siteSettingsService')).getPublicSiteTheme()
  },
  async load_default_site_theme(mode) {
    const themes = await import('../../siteThemes')
    if (mode === 'presentation') {
      return {
        ...themes.defaultSiteThemeResponse,
        themeId: 'presentation',
        config: themes.presentationThemeConfig,
      }
    }
    return themes.defaultSiteThemeResponse
  },
}
