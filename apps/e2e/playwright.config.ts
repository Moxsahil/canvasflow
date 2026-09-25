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
      // Password recovery, account security and the legal pages run in their
      // own projects, below.
      testIgnore: /(password-reset|account-security|legal)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Every test in this project starts already signed in, from the file
        // the setup project just wrote.
        storageState: 'playwright/.auth/user.json',
      },
      // Nothing here starts until setup has passed.
      dependencies: ['setup'],
    },
    // Password recovery makes its own throwaway account and signs in and out
    // of it, so it starts signed out and does not wait on the shared session
    // above. Run on its own with `--project=recovery`.
    {
      name: 'recovery',
      testMatch: /password-reset\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Settings → Account & Security, with its own throwaway account for the
    // same reason. Run on its own with `--project=account`.
    {
      name: 'account',
      testMatch: /account-security\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // The terms and the lines pointing at them, as someone who has never signed
    // in sees them — so no shared session. Run on its own with `--project=legal`.
    {
      name: 'legal',
      testMatch: /legal\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
