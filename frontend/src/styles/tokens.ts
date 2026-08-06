export const tokens = {
  colors: {
    brandMain: '#7BAF4B',
    brandAccent: '#FDCD43',
    brandSecondary: '#076050',
    brandDeep: '#f8faf6',
    brandInk: '#17211d',
    brandMuted: '#65746c',
    glassBorder: '#c8d6c3',
    glassHighlight: 'rgba(255, 255, 255, 0.82)',
    danger: '#b42318',
    success: '#16803a',
    lightBg: '#f8faf6',
    white: '#ffffff',
    black: '#000000',
  },
  typography: {
    fontFamily: "'Rubik', sans-serif",
    headingWeight: '900',
    bodyWeight: '400',
    bodyLineHeight: '1.5',
    headingLineHeight: '1.08',
    letterSpacing: '0',
  },
  radii: {
    sm: '8px',
    md: '12px',
    lg: '18px',
  },
  gradients: {
    body: '#f8faf6',
    brand: '#7BAF4B',
    glass: 'rgba(255, 255, 255, 0.96)',
    glassStrong: '#ffffff',
  },
  shadows: {
    glass: '0 18px 48px rgba(23, 33, 29, 0.1)',
    focus: '0 0 0 4px rgba(253, 205, 67, 0.16)',
  },
  focus: {
    ring: 'rgba(253, 205, 67, 0.78)',
    ringOffset: '3px',
  },
} as const

export type DesignTokens = typeof tokens
