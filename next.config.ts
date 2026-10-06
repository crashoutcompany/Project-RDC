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
