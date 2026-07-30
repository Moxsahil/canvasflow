import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@canvasflow/ui', '@canvasflow/types'],
  // In monorepos, tell Next.js where to trace files from so client-reference
  // manifests can be located during Vercel's output tracing step.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  experimental: {
    // Reduces hydration warnings in dev
    optimizePackageImports: ['@canvasflow/ui'],
  },
};

export default nextConfig;
