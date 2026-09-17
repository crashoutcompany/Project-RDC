// shared:create-auth v1

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { resolveAuthBaseUrl, type AuthBaseUrlEnv } from "./base-url";

export type SocialProviderId = "github" | "google";

type AuthEnv = AuthBaseUrlEnv & {
  BETTER_AUTH_SECRET?: string;
  AUTH_GITHUB_ID?: string;
  AUTH_GITHUB_SECRET?: string;
  AUTH_GOOGLE_ID?: string;
  AUTH_GOOGLE_SECRET?: string;
};

type ProviderCredentials = {
  clientId: string;
  clientSecret: string;
};

type AuthEnvironment = {
  secret: string;
  socialProviders: Partial<Record<SocialProviderId, ProviderCredentials>>;
  enabledSocialProviders: SocialProviderId[];
};

type CreateAuthOptions = {
  appName: string;
  database: NonNullable<BetterAuthOptions["database"]>;
  env?: AuthEnv;
  productionUrl: string;
  previewOrigin: string;
  extraTrustedOrigins?: readonly string[];
  sessionModelName?: string;
  userAdditionalFields?: NonNullable<
    NonNullable<BetterAuthOptions["user"]>["additionalFields"]
  >;
  onError?: NonNullable<
    NonNullable<BetterAuthOptions["onAPIError"]>["onError"]
  >;
};

const PROVIDER_ENV = {
  github: {
    clientId: "AUTH_GITHUB_ID",
    clientSecret: "AUTH_GITHUB_SECRET",
  },
  google: {
    clientId: "AUTH_GOOGLE_ID",
    clientSecret: "AUTH_GOOGLE_SECRET",
  },
} as const satisfies Record<
  SocialProviderId,
  { clientId: keyof AuthEnv; clientSecret: keyof AuthEnv }
>;

function readValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function resolveSocialProviders(
  env: AuthEnv,
  warnOnPartialConfig: boolean,
): Pick<AuthEnvironment, "socialProviders" | "enabledSocialProviders"> {
  const socialProviders: AuthEnvironment["socialProviders"] = {};
  const enabledSocialProviders: SocialProviderId[] = [];

  for (const provider of Object.keys(PROVIDER_ENV) as SocialProviderId[]) {
    const names = PROVIDER_ENV[provider];
    const clientId = readValue(env[names.clientId]);
    const clientSecret = readValue(env[names.clientSecret]);

    if (clientId && clientSecret) {
      socialProviders[provider] = { clientId, clientSecret };
      enabledSocialProviders.push(provider);
    } else if (warnOnPartialConfig && (clientId || clientSecret)) {
      console.warn(
        `[auth] ${provider} sign-in is disabled: set both ${names.clientId} and ${names.clientSecret}.`,
      );
    }
  }

  return { socialProviders, enabledSocialProviders };
}

export function getEnabledSocialProviders(
  env: AuthEnv = process.env,
): SocialProviderId[] {
  return resolveSocialProviders(env, false).enabledSocialProviders;
}

export function requireBetterAuthSecret(env: AuthEnv = process.env): string {
  const secret = readValue(env.BETTER_AUTH_SECRET);
  if (!secret) {
    throw new Error("BETTER_AUTH_SECRET environment variable is required");
  }

  return secret;
}

export function resolveAuthEnvironment(
  env: AuthEnv = process.env,
): AuthEnvironment {
  return {
    secret: requireBetterAuthSecret(env),
    ...resolveSocialProviders(env, true),
  };
}

export function createAuth({
  appName,
  database,
  env = process.env,
  productionUrl,
  previewOrigin,
  extraTrustedOrigins = [],
  sessionModelName,
  userAdditionalFields,
  onError,
}: CreateAuthOptions) {
  const { secret, socialProviders } = resolveAuthEnvironment(env);

  return betterAuth({
    appName,
    baseURL: resolveAuthBaseUrl(productionUrl, env),
    trustedOrigins: [
      ...new Set([productionUrl, previewOrigin, ...extraTrustedOrigins]),
    ],
    database,
    secret,
    socialProviders,
    session: {
      ...(sessionModelName ? { modelName: sessionModelName } : {}),
      cookieCache: {
        enabled: true,
        maxAge: 300,
      },
    },
    ...(userAdditionalFields
      ? { user: { additionalFields: userAdditionalFields } }
      : {}),
    ...(onError ? { onAPIError: { onError } } : {}),
    plugins: [nextCookies()],
  });
}
