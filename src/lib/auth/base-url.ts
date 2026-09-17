// shared:base-url v1

export type AuthBaseUrlEnv = {
  BETTER_AUTH_URL?: string;
  NODE_ENV?: string;
  VERCEL_ENV?: string;
  VERCEL_BRANCH_URL?: string;
  VERCEL_URL?: string;
  PORT?: string;
};

export function isLoopbackUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * Resolves the URL Better Auth uses for cookies and OAuth redirect URIs.
 * A loopback override is ignored in production builds so a stale local value
 * cannot break a deployed sign-in flow.
 */
export function resolveAuthBaseUrl(
  productionUrl: string,
  env: AuthBaseUrlEnv = process.env,
): string {
  const configuredUrl = env.BETTER_AUTH_URL?.trim();
  const isProductionBuild = env.NODE_ENV === "production";

  if (configuredUrl) {
    if (!isProductionBuild || !isLoopbackUrl(configuredUrl)) {
      return configuredUrl;
    }

    console.warn(
      `[auth] Ignoring loopback BETTER_AUTH_URL in a production build and using ${productionUrl}. Set BETTER_AUTH_URL to the deployment URL.`,
    );
  }

  if (env.VERCEL_ENV === "preview") {
    const previewHost = env.VERCEL_BRANCH_URL || env.VERCEL_URL;
    if (previewHost) return `https://${previewHost}`;
  }

  if (isProductionBuild) return productionUrl;
  return `http://localhost:${env.PORT ?? "3000"}`;
}
