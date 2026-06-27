import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // When the FastAPI backend runs on a DIFFERENT origin (e.g. a separate Render
  // service), set API_PROXY_TARGET to its URL so same-origin `/api/*` calls are
  // proxied to it. Left unset in the Emergent preview (ingress already routes /api).
  async rewrites() {
    const target = process.env.API_PROXY_TARGET;
    if (!target) return [];
    return [{ source: "/api/:path*", destination: `${target.replace(/\/$/, "")}/api/:path*` }];
  },
  // Pin the workspace root to this folder so Next.js doesn't get confused by a
  // stray lockfile at the repo root (which breaks the RSC client manifest).
  turbopack: {
    root: path.join(__dirname),
  },
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
