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
    // OG image routes readFile art from public/ and fonts from src/assets at
    // runtime (src/lib/og.tsx). Dynamic reads aren't traced automatically,
    // and public/ is otherwise only served from the CDN.
    outputFileTracingIncludes: {
      "**/opengraph-image*": [
        "./public/images/**/*",
        "./public/fighters/**/*",
        "./src/assets/fonts/*.ttf",
      ],
      "**/opengraph-image*/**": [
        "./public/images/**/*",
        "./public/fighters/**/*",
        "./src/assets/fonts/*.ttf",
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
