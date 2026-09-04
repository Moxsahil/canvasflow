import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  // Collaboration tests drive two browser contexts against shared server
  // state; running files in parallel makes them fight over the same board.
  fullyParallel: false,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Runs first, on its own: signs in through the real login form and writes
    // the resulting cookies to disk. Split out because logging in once and
    // reusing the session is the difference between a suite that takes
    // seconds and one that re-authenticates on every single test.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Every test in this project starts already signed in, from the file
        // the setup project just wrote.
        storageState: 'playwright/.auth/user.json',
      },
      // Nothing here starts until setup has passed.
      dependencies: ['setup'],
    },
  ],
});
