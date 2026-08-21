import { createGlobalStyle } from 'styled-components'

import { cssVariableDeclarations } from './theme'

export const GlobalStyles = createGlobalStyle`
  :root {
    ${cssVariableDeclarations}
    color-scheme: light;
    font-family: var(--font-family-base);
    background: var(--background-body);
    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  * {
    margin: 0;
    padding: 0;
  }

  html {
    width: 100%;
    max-width: 100%;
    min-height: 100%;
    overflow-x: clip;
    scroll-behavior: smooth;
  }

  body {
    width: 100%;
    max-width: 100%;
    min-width: 320px;
    min-height: 100vh;
    margin: 0;
    overflow-x: clip;
    background: var(--background-body);
    color: var(--brand-ink);
    font-family: var(--font-family-base);
    font-size: 1rem;
    font-weight: var(--font-weight-body);
    line-height: var(--line-height-body);
    letter-spacing: var(--letter-spacing-base);
  }

  #root {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 100%;
    min-height: 100vh;
    overflow-x: clip;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6,
  p,
  label,
  input,
  button,
  textarea,
  select,
  span,
  ul,
  li {
    font-family: var(--font-family-base);
    font-style: normal;
    letter-spacing: var(--letter-spacing-base);
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    color: inherit;
    font-weight: var(--font-weight-heading);
    line-height: var(--line-height-heading);
  }

  p {
    line-height: var(--line-height-body);
  }

  button,
  input,
  textarea,
  select {
    font: inherit;
  }

  select {
    color-scheme: light;
  }

  select:not([multiple]) {
    min-height: 40px;
    appearance: none;
    -webkit-appearance: none;
    border: 1px solid #c8d6c3;
    border-radius: 12px;
    background-color: #ffffff !important;
    background-image: url("data:image/svg+xml,%3Csvg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23526159' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") !important;
    background-position: right 12px center !important;
    background-repeat: no-repeat !important;
    background-size: 16px !important;
    color: var(--brand-ink);
    cursor: pointer;
    padding: 0.56rem 2.35rem 0.56rem 0.82rem;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      background-color 0.18s ease,
      color 0.18s ease;
  }

  select:not([multiple]):hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--brand-ink) 24%, #c8d6c3);
    background-color: #ffffff !important;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-ink) 8%, transparent);
  }

  select:not([multiple]):focus {
    border-color: color-mix(in srgb, var(--brand-ink) 48%, #c8d6c3);
    background-color: #ffffff !important;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--brand-ink) 10%, transparent);
    outline: none;
  }

  select:disabled {
    background-color: #f1f4ef !important;
    color: var(--brand-muted);
    opacity: 0.72;
  }

  select option,
  select optgroup {
    min-height: 38px;
    background-color: #f8faf6;
    color: var(--brand-ink);
    font: inherit;
    font-size: 0.95rem;
    font-weight: 500;
    line-height: 1.5;
    padding: 0.65rem 0.9rem;
  }

  select option:hover,
  select option:focus {
    background-color: #eef7e9;
    color: var(--brand-ink);
  }

  select option:checked {
    background-color: var(--brand-main);
    color: #ffffff;
    font-weight: 650;
  }

  select::-ms-expand {
    display: none;
  }

  button {
    cursor: pointer;
  }

  button:disabled,
  input:disabled,
  textarea:disabled,
  select:disabled {
    cursor: not-allowed;
  }

  img,
  picture,
  video,
  canvas {
    display: block;
    max-width: 100%;
  }

  ::selection {
    background-color: var(--brand-main);
    color: var(--white);
  }

  :where(a, button, input, textarea, select, summary, [tabindex]:not([tabindex='-1'])):focus-visible {
    outline: 3px solid var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
    box-shadow: var(--focus-ring-shadow);
  }

  :where(button, .btn, .bonefree-button, .bonefree-button-secondary, .ad-btn, [role='button']):hover,
  :where(button, .btn, .bonefree-button, .bonefree-button-secondary, .ad-btn, [role='button']):focus,
  :where(button, .btn, .bonefree-button, .bonefree-button-secondary, .ad-btn, [role='button']):focus-visible {
    text-decoration: none;
  }

  :where(button, .btn, .bonefree-button, .bonefree-button-secondary, .ad-btn):focus-visible {
    box-shadow: none;
  }

  @media (prefers-reduced-motion: reduce) {
    html {
      scroll-behavior: auto;
    }

    *,
    *::before,
    *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }




  
`
