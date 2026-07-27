import type { NextConfig } from "next";

// `eslint` is a valid Next option but missing from this version's NextConfig
// type. Satisfies the annotation without discarding type-checking on the rest.
const nextConfig: NextConfig & { eslint?: { ignoreDuringBuilds?: boolean } } = {
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
