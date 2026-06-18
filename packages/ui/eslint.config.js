import reactConfig from '@canvasflow/config/eslint/react';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...reactConfig,
  {
    settings: {
      react: { version: '18' },
    },
  },
];
