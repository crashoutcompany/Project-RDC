// shared:next-config v1

import type { NextConfig } from "next";

import { isTestingApiExposed } from "./e2e-env";

const DEFAULT_OPTIMIZE_PACKAGES = ["lucide-react"];

const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
];

const POSTHOG_REWRITES = [
  {
    source: "/ingest/static/:path*",
    destination: "https://us-assets.i.posthog.com/static/:path*",
  },
  {
    source: "/ingest/:path*",
    destination: "https://us.i.posthog.com/:path*",
  },
];

type RewriteList = Awaited<
  ReturnType<NonNullable<NextConfig["rewrites"]>>
>;

type AppDefaultsOptions = {
  posthogIngest?: boolean;
};

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

type ExperimentalWithTestingApi = NonNullable<NextConfig["experimental"]> & {
  exposeTestingApiInProductionBuild?: boolean;
};

export function withAppDefaults(
  config: NextConfig = {},
  options: AppDefaultsOptions = {},
): NextConfig {
  const {
    experimental,
    headers: customHeaders,
    rewrites: customRewrites,
    skipTrailingSlashRedirect,
    ...rest
  } = config;

  const nextExperimental: ExperimentalWithTestingApi = {
    ...experimental,
    optimizePackageImports: unique([
      ...DEFAULT_OPTIMIZE_PACKAGES,
      ...(experimental?.optimizePackageImports ?? []),
    ]),
    exposeTestingApiInProductionBuild:
      (experimental as ExperimentalWithTestingApi | undefined)
        ?.exposeTestingApiInProductionBuild ?? isTestingApiExposed(),
  };

  return {
    cacheComponents: true,
    reactCompiler: true,
    ...rest,
    experimental: nextExperimental as NextConfig["experimental"],
    ...(options.posthogIngest || skipTrailingSlashRedirect
      ? { skipTrailingSlashRedirect: true }
      : {}),
    async headers() {
      const securityHeaders = [...SECURITY_HEADERS];
      if (process.env.NODE_ENV === "production") {
        securityHeaders.push({
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        });
      }

      const defaults = [{ source: "/:path*", headers: securityHeaders }];
      const extra = customHeaders ? await customHeaders() : [];
      return [...defaults, ...extra];
    },
    async rewrites() {
      const extra: RewriteList = customRewrites ? await customRewrites() : [];
      if (!options.posthogIngest) return extra;
      if (Array.isArray(extra)) return [...POSTHOG_REWRITES, ...extra];
      return {
        ...extra,
        beforeFiles: [...POSTHOG_REWRITES, ...(extra.beforeFiles ?? [])],
      };
    },
  };
}
