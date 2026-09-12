import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  // A CI runner has no GPU, so the stage renders through SwiftShader and the
  // whole suite runs several times slower than on a developer machine. The
  // assertions are unchanged; only the patience is.
  timeout: process.env.CI ? 180000 : 45000,
  expect: { timeout: process.env.CI ? 15000 : 5000 },
  // Software rendering makes frame timing genuinely nondeterministic, so one
  // retry buys back a rare unlucky run. Playwright still reports a test that
  // only passed on retry as flaky, so this hides nothing.
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined),
      args: process.platform === 'darwin' ? ['--use-angle=metal'] : [],
    },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: true,
  },
})
