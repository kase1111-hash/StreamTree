/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@streamtree/shared'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;
