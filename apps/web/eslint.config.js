import reactConfig from '@canvasflow/config/eslint/react';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...reactConfig,
  {
    settings: {
      react: { version: '18' },
    },
  },
  {
    ignores: [
      '.next/**',
      '.next-e2e/**',
      '.next-perf/**',
      '.turbo/**',
      'node_modules/**',
      'next-env.d.ts',
    ],
  },
];
