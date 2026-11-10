import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Names the framework to anyone choosing which known bug to try.
  poweredByHeader: false,
  // `.next` unless told otherwise. The local end-to-end stack builds into its
  // own folder so it never overwrites the one a running `next dev` is using.
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
        // No page of the site may be shown inside another site's frame: one
        // that could would let that site lay its own page over ours and steer
        // clicks into sign-in, account and sharing controls (clickjacking).
        // Both headers, as older browsers read only the second.
        //
        // The policy also bars plugins (`object-src`) and a `<base>` tag
        // pointing elsewhere, neither of which any page uses. It does not yet
        // restrict scripts: the framework writes inline scripts into every
        // page, and allowing them by nonce would make every page render per
        // request, which is what made the landing page slow to open.
        //
        // The rest: no guessing a file's type from its bytes; only the origin,
        // not the path, sent to other sites; HTTPS only for a year (not for
        // subdomains, which this app does not all own); and no camera,
        // microphone or location for any page.
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      {
        // Pictures under public/. Their names carry no content hash, so they
        // are not cached for good like /_next/static: a day fresh, then served
        // from the cache for up to a week while the browser checks for a newer
        // copy in the background. Without this every visit asks for them again.
        source: '/:dir(assets|brand)/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=86400, stale-while-revalidate=604800',
          },
        ],
      },
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
      {
        // The same, for the reset link. The page moves the token out of the
        // address bar before it makes any request, but the header covers the
        // moment before that, and anything that loads if the page breaks.
        //
        // no-store as well: this page is never worth caching, and a cached copy
        // of a page someone reached through a credential is not something a
        // shared computer should keep.
        source: '/reset-password',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Cache-Control', value: 'no-store' },
        ],
      },
    ];
  },
};

export default nextConfig;
