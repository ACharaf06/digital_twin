import { defineConfig } from '@playwright/test'
import { existsSync } from 'node:fs'

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
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
