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
  async headers() {
    return [
      {
        // The one page whose address bar holds a live credential. Without this
        // any outbound request from it puts the whole URL, token and all, into
        // a Referer header.
        //
        // The page also declares this as a meta tag, which is what governs the
        // requests the page itself makes. The header is the stronger of the
        // two: it applies before a single byte of HTML is parsed, so it still
        // holds if the document fails to render.
        source: '/verify-email',
        headers: [{ key: 'Referrer-Policy', value: 'no-referrer' }],
      },
    ];
  },
};

export default nextConfig;
