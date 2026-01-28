/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@streamtree/shared'],
  images: {
    // SECURITY: Restrict image domains to known CDN/storage sources
    // instead of allowing all HTTPS domains
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.amazonaws.com', // AWS S3
      },
      {
        protocol: 'https',
        hostname: '*.cloudfront.net', // AWS CloudFront
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com', // GitHub avatars
      },
      {
        protocol: 'https',
        hostname: 'static-cdn.jtvnw.net', // Twitch avatars
      },
      {
        protocol: 'https',
        hostname: '*.twitch.tv', // Twitch assets
      },
    ],
  },
};

module.exports = nextConfig;
