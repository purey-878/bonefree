import type { ThemeDefinition } from '../../app/manifest/types'

export const baseTheme: ThemeDefinition = {
  key: 'base',
  supported_modes: ['default'],
  supported_decoration_presets: [],
  default_section_variants: {},
  default_component_variants: {},
  async load_default_site_theme() {
    return (await import('./siteTheme')).baseSiteTheme
  },
}
