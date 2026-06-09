/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@canvasflow/ui', '@canvasflow/types'],
  experimental: {
    // Reduces hydration warnings in dev
    optimizePackageImports: ['@canvasflow/ui'],
  },
};

export default nextConfig;
