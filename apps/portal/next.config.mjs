/** @type {import('next').NextConfig} */
export default {
  output: 'standalone',
  transpilePackages: ['@rihla/ui', '@rihla/api-client'],
  poweredByHeader: false,
  // /api is proxied to the API by src/app/api/[...path]/route.ts (read at runtime, not baked in at build)
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
