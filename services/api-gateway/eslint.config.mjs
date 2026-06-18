import nodeConfig from '@canvasflow/config/eslint/node';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nodeConfig,
  {
    // NestJS uses emitDecoratorMetadata to record constructor param types at
    // runtime. Type-only imports are erased before metadata emission, so
    // injectable classes MUST be value imports — not `import type`.
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
];
