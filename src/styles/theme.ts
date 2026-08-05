import { tokens } from './tokens'

export const theme = {
  ...tokens,
  cssVariables: {
    '--brand-main': tokens.colors.brandMain,
    '--brand-accent': tokens.colors.brandAccent,
    '--brand-secondary': tokens.colors.brandSecondary,
    '--brand-deep': tokens.colors.brandDeep,
    '--brand-ink': tokens.colors.brandInk,
    '--brand-muted': tokens.colors.brandMuted,
    '--glass-bg': tokens.gradients.glass,
    '--glass-bg-strong': tokens.gradients.glassStrong,
    '--glass-border': tokens.colors.glassBorder,
    '--glass-highlight': tokens.colors.glassHighlight,
    '--danger': tokens.colors.danger,
    '--success': tokens.colors.success,
    '--light-bg': tokens.colors.lightBg,
    '--white': tokens.colors.white,
    '--black': tokens.colors.black,
    '--radius-sm': tokens.radii.sm,
    '--radius-md': tokens.radii.md,
    '--radius-lg': tokens.radii.lg,
    '--shadow-glass': tokens.shadows.glass,
    '--font-family-base': tokens.typography.fontFamily,
    '--font-weight-body': tokens.typography.bodyWeight,
    '--font-weight-heading': tokens.typography.headingWeight,
    '--line-height-body': tokens.typography.bodyLineHeight,
    '--line-height-heading': tokens.typography.headingLineHeight,
    '--letter-spacing-base': tokens.typography.letterSpacing,
    '--background-body': tokens.gradients.body,
    '--brand-gradient': tokens.gradients.brand,
    '--focus-ring': tokens.focus.ring,
    '--focus-ring-offset': tokens.focus.ringOffset,
    '--focus-ring-shadow': tokens.shadows.focus,
  },
} as const

export const cssVariableDeclarations = Object.entries(theme.cssVariables)
  .map(([name, value]) => `${name}: ${value};`)
  .join('\n')

export type AppTheme = typeof theme

declare module 'styled-components' {
  export interface DefaultTheme {
    colors: AppTheme['colors']
    typography: AppTheme['typography']
    radii: AppTheme['radii']
    gradients: AppTheme['gradients']
    shadows: AppTheme['shadows']
    focus: AppTheme['focus']
    cssVariables: AppTheme['cssVariables']
  }
}
