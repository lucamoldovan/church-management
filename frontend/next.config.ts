import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow Emergent preview hosts so Next.js 16 dev server serves /_next/*
  // (HMR/RSC/client chunks). Without this, client components never hydrate
  // when accessed via the preview URL.
  allowedDevOrigins: [
    "*.preview.emergentagent.com",
    "*.preview.emergentcf.cloud",
    "*.cluster-5.preview.emergentcf.cloud",
    "*.emergentagent.com",
    "*.emergentcf.cloud",
    "*.emergent.host",
  ],
};

export default nextConfig;
