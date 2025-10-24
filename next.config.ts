import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Disable static optimization for API routes
  experimental: {
    // Allow larger request bodies if needed
  },
  // Enable logging for debugging
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

export default nextConfig;

