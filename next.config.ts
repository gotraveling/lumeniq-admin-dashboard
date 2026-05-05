import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required for the Dockerfile's `.next/standalone` copy step. Produces a
  // self-contained server output suitable for Cloud Run.
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
