import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  use: {
    baseURL: process.env.APP_URL || 'http://127.0.0.1:18766',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: process.env.APP_URL ? undefined : {
    command: 'build/approach --port 18766 --web build/web',
    url: 'http://127.0.0.1:18766/health',
    reuseExistingServer: false,
  },
});
