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
      // Password recovery, account security, the legal pages and account
      // deletion run in their own projects, below.
      testIgnore:
        /(password-reset|account-security|legal|account-deletion(-request|-ui)?|account-purge|account-restore|username|workspace-invites|workspace-members|shared-boards|notification-settings|mention-emails|join-and-access-emails|weekly-digest|pen-mode)\.spec\.ts/,
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
    // Settings → Profile → Username, with two throwaway accounts of its own:
    // one to claim names, one to hold a name the first cannot have. Run on its
    // own with `--project=username`.
    {
      name: 'username',
      testMatch: /username\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // The terms and the lines pointing at them, as someone who has never signed
    // in sees them — so no shared session. Run on its own with `--project=legal`.
    {
      name: 'legal',
      testMatch: /legal\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Inviting people into a workspace by email, and the /join page they open,
    // with throwaway people of its own. Run on its own with `--project=invites`.
    {
      name: 'invites',
      testMatch: /workspace-invites\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Changing people's roles, removing them, leaving and handing a workspace
    // over, with four throwaway people. Run on its own with `--project=members`.
    {
      name: 'members',
      testMatch: /workspace-members\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Boards shared by link: the sidebar's "Shared with you", and a removed
    // guest kept out. Run on its own with `--project=shared`.
    {
      name: 'shared',
      testMatch: /shared-boards\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Settings → Notifications, one throwaway account on two devices. Run on
    // its own with `--project=notifications`.
    {
      name: 'notifications',
      testMatch: /notification-settings\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Comment mention emails and unsubscribing from them, with two throwaway
    // people. Run on its own with `--project=mentions`.
    {
      name: 'mentions',
      testMatch: /mention-emails\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Emails about joins and access changes, with throwaway people and a
    // guest. Run on its own with `--project=join-emails`.
    {
      name: 'join-emails',
      testMatch: /join-and-access-emails\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // The weekly digest: activity counted, a dry run, a real run and a rerun.
    // A real run is for everyone in the development database who turned the
    // digest on. Run on its own with `--project=digest`.
    {
      name: 'digest',
      testMatch: /weekly-digest\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Pen mode on a touch screen, driven with emulated pen and touch input,
    // with a throwaway account of its own. Run on its own with `--project=pen`.
    {
      name: 'pen',
      testMatch: /pen-mode\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], hasTouch: true },
    },
    // Deleting an account: the data layer, the daily purge and support's
    // restore straight against the development database, asking for it through
    // the gateway, and the Settings dialog in the real editor, each with
    // throwaway people of its own. Run on its own with `--project=deletion`.
    {
      name: 'deletion',
      testMatch: /account-(deletion(-request|-ui)?|purge|restore)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
