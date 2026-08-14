import baseConfig from '@canvasflow/config/eslint/base';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...baseConfig,
  {
    // eslint-plugin-react itself is incompatible with ESLint 10, so the shared
    // `react` config can't be used here. react-hooks works standalone, and it
    // is the half that matters: exhaustive-deps catches stale closures over
    // scene state, which silently break pointer handlers.
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', '.turbo/**'],
  },
];
