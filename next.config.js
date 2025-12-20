/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Enable static export for PWA
  output: process.env.STATIC_EXPORT === 'true' ? 'export' : undefined,
};

module.exports = nextConfig;
