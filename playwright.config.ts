import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'

// Uses a pre-installed Chromium when present (cloud sandbox), otherwise Playwright's own.
const sandboxChromium = '/opt/pw-browsers/chromium'
const executablePath = process.env.PW_CHROMIUM ?? (existsSync(sandboxChromium) ? sandboxChromium : undefined)
const launchOptions = {
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
}

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173/',
    trace: 'retain-on-failure',
    ignoreHTTPSErrors: !!process.env.E2E_NODE_FETCH,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions } },
  ],
  webServer: {
    command: 'npx vite build && npx vite preview --port 4173 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:4173/',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
