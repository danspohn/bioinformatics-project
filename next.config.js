/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "aws-crt": false,
    };
    return config;
  },
  // Add this to ensure proper routing
  trailingSlash: false,
  // Add this if you're using API routes
  api: {
    bodyParser: true,
  }
}

module.exports = nextConfig