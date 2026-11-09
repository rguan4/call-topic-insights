import { defineConfig, devices } from '@playwright/test';

// Starts its own API (4300) and web server (5300) with fast simulated timers,
// so it can run next to `npm run dev`.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5300',
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: [
    {
      command: 'npx tsx src/index.ts',
      cwd: '../backend',
      port: 4300,
      reuseExistingServer: false,
      env: { PORT: '4300', CTI_PERSIST: 'false', CTI_AI_DELAY_MS: '600', CTI_TASK_TICK_MS: '150', CTI_PREP_TICK_MS: '300' }
    },
    {
      command: 'npx vite --strictPort',
      cwd: '../frontend',
      port: 5300,
      reuseExistingServer: false,
      env: { API_PORT: '4300', WEB_PORT: '5300' }
    }
  ]
});
