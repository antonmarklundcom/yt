import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Hostinger's Node slot runs `next start` against the standard build output.
  // Do not switch to `output: "standalone"` — the managed GitHub integration
  // expects the default layout.
  images: {
    // YouTube thumbnails are the only remote images this app renders.
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
    ],
  },
  eslint: {
    // Lint is a separate CI step; a lint warning should not fail the deploy.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
