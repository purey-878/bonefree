import type { SiteThemeResponse } from '../../types/siteSettings'

export const baseSiteTheme: SiteThemeResponse = {
  themeId: 'base',
  colors: {},
  decorationEnabled: false,
  decorationIntensity: 1,
  customDecorations: [],
  customName: null,
  config: {
    id: 'base',
    name: 'Base',
    colors: {
      primary: '#365f56',
      accent: '#d4a72c',
      secondary: '#243f3a',
      background: '#f5f6f4',
      surface: '#ffffff',
      text: '#17201d',
      textMuted: '#62706b',
      border: '#d9dfdc',
      priceHighlight: '#a33a31',
    },
    background: { type: 'solid', value: '#f5f6f4' },
    decorations: [],
    ui: {
      borderRadius: '8px',
      buttonStyle: 'rounded',
      cardShadow: '0 16px 42px rgba(23, 32, 29, 0.1)',
    },
  },
}
