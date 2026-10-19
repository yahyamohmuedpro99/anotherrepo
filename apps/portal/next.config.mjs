/** @type {import('next').NextConfig} */
const API = process.env.API_URL ?? 'http://localhost:4000';
export default {
  output: 'standalone',
  transpilePackages: ['@rihla/ui', '@rihla/api-client'],
  poweredByHeader: false,
  // The browser talks to the API through /api on the portal's own origin, so the refresh cookie is first-party.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API}/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
