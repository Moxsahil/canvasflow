import baseConfig from '@canvasflow/config/eslint/base';

export default [
  ...baseConfig,
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
];
