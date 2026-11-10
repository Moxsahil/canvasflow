import ts from 'typescript';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Compiles the gateway's TypeScript the way `nest build` does, decorator
 * metadata included.
 *
 * Nest finds what to inject from the constructor parameter types TypeScript
 * records (`design:paramtypes`). Vite's own compiler, esbuild, does not write
 * them, so a test that starts the real app would get `undefined` for every
 * service. The TypeScript compiler is already here; one file at a time is
 * enough for it to emit them.
 */
function decoratorMetadata(): Plugin {
  return {
    name: 'canvasflow:decorator-metadata',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.ts') || id.includes('/node_modules/') || !code.includes('@')) return null;
      const out = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          useDefineForClassFields: false,
          sourceMap: true,
          inlineSources: true,
        },
      });
      return {
        code: out.outputText,
        map: out.sourceMapText ? JSON.parse(out.sourceMapText) : null,
      };
    },
  };
}

export default defineConfig({
  plugins: [decoratorMetadata()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
    // One throwaway Postgres for the whole run, for the files that start the
    // real gateway (src/testing/). Started before any test file.
    globalSetup: ['./src/testing/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/testing/**'],
      reporter: ['text', 'json-summary', 'json'],
    },
  },
});
