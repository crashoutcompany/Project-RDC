import { NextConfig } from "next";
import { withBotId } from "botid/next/config";

/**
 * Instant-nav e2e marker for local/CI measured builds only.
 * Never true on Vercel deploys (`VERCEL=1` is set for preview and production).
 */
const isInstantNavTestBuild =
  process.env.INSTANT_NAV_TEST_BUILD === "1" &&
  process.env.VERCEL !== "1";

const nextConfig: NextConfig = {
  cacheComponents: true,
  reactCompiler: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"],
    exposeTestingApiInProductionBuild: isInstantNavTestBuild,
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "static.wikia.nocookie.net" },
    ],
  },

  async rewrites() {
    return [
      {
        source: "/ingest/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ingest/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },

  // This is required to support PostHog trailing slash API requests
  skipTrailingSlashRedirect: true,
};

export default withBotId(nextConfig);
