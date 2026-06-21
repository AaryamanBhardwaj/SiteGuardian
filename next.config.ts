import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export is enabled at build time for S3+CloudFront deployment.
  // During development, we run in normal mode for dynamic routes.
  // Phase 8 will add the build script that sets output: 'export'.
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
