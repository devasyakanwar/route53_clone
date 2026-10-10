import type { NextConfig } from 'next';

const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8000';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@cloudscape-design/components',
    '@cloudscape-design/component-toolkit',
    '@cloudscape-design/collection-hooks',
    '@cloudscape-design/global-styles',
  ],
  experimental: {
    // The /api proxy gives up after 30 s by default, but a sleeping free-tier API takes about a minute to wake up.
    proxyTimeout: 120_000,
  },
  async rewrites() {
    // Keep the browser on one origin so the httpOnly session cookie works without CORS.
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
