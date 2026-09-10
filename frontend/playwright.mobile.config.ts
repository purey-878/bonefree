import { defineConfig } from '@playwright/test'
import base from './playwright.legal.config'

export default defineConfig({
  ...base,
  use: {
    ...base.use,
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 3.5,
    isMobile: true,
    hasTouch: true,
  },
})
