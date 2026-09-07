import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e', testMatch: '**/*.pw.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5179', headless: true, trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined } },
  webServer: [
    { command: '..\\.venv\\Scripts\\python.exe e2e/serve_legal_api.py', url: 'http://127.0.0.1:8019/health', reuseExistingServer: false },
    { command: 'npm.cmd run dev -- --host 127.0.0.1 --port 5179 --strictPort', url: 'http://127.0.0.1:5179',
      env: { VITE_API_BASE_URL: 'http://127.0.0.1:8019' }, reuseExistingServer: false },
  ],
})
