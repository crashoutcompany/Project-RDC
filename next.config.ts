import { NextConfig } from "next";
import { withBotId } from "botid/next/config";

import { withAppDefaults } from "./src/lib/next-config";

const nextConfig: NextConfig = withAppDefaults(
  {
    serverExternalPackages: [
      "@opentelemetry/sdk-node",
      "@opentelemetry/resources",
      "@posthog/ai",
      "@ai-sdk/otel",
    ],
    // OG image routes read art from public/ at runtime (src/lib/og.tsx);
    // public/ is served from the CDN, so it isn't traced into functions.
    outputFileTracingIncludes: {
      "**/opengraph-image*": ["./public/images/**/*", "./public/fighters/**/*"],
      "**/opengraph-image*/**": [
        "./public/images/**/*",
        "./public/fighters/**/*",
      ],
    },
    experimental: {
      optimizePackageImports: ["lucide-react", "recharts"],
    },
    images: {
      remotePatterns: [
        { protocol: "https", hostname: "i.ytimg.com" },
        { protocol: "https", hostname: "static.wikia.nocookie.net" },
      ],
    },
  },
  { posthogIngest: true },
);

export default withBotId(nextConfig);
