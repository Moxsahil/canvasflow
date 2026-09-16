import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@canvasflow/ui', '@canvasflow/types'],
  // In monorepos, tell Next.js where to trace files from so client-reference
  // manifests can be located during Vercel's output tracing step.
  outputFileTracingRoot: path.join(here, '../../'),
  experimental: {
    // Reduces hydration warnings in dev
    optimizePackageImports: ['@canvasflow/ui'],
  },
};

export default nextConfig;
