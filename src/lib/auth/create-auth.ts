import { betterAuth, type BetterAuthOptions } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import {
  resolveAuthBaseUrl,
  resolvePreviewOrigins,
  type AuthBaseUrlEnv,
} from "./base-url";
import {
  createEmailOtpPlugins,
  EMAIL_OTP_DISABLED_PATHS,
  normalizeOtpEmail,
  resolveEmailOtpConfig,
  type EmailOtpEnv,
} from "./email-otp";
import {
  createAuthRateLimitStore,
  createOtpEmailLockoutPlugin,
  rateLimitPrefixFromAppName,
  type RateLimitEnv,
} from "./rate-limit";
import { otpAdminGuardPlugin } from "./otp-admin-guard";

export type SocialProviderId = "github" | "google";

type AuthEnv = AuthBaseUrlEnv &
  EmailOtpEnv &
  RateLimitEnv & {
    NODE_ENV?: string;
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

type UserAdditionalFields = NonNullable<
  NonNullable<BetterAuthOptions["user"]>["additionalFields"]
>;

type CreateAuthOptions<TFields extends UserAdditionalFields = UserAdditionalFields> =
  {
    appName: string;
    database: NonNullable<BetterAuthOptions["database"]>;
    env?: AuthEnv;
    productionUrl: string;
    extraTrustedOrigins?: readonly string[];
    sessionModelName?: string;
    userAdditionalFields?: TFields;
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

export function createAuth<const TFields extends UserAdditionalFields>({
  appName,
  database,
  env = process.env,
  productionUrl,
  extraTrustedOrigins = [],
  sessionModelName,
  userAdditionalFields,
  onError,
}: CreateAuthOptions<TFields>) {
  const { secret, socialProviders } = resolveAuthEnvironment(env);
  const emailOtp = resolveEmailOtpConfig(env, true);
  // Per-IP limits (Better Auth) and the per-email lockout share one store, so
  // both use Redis when it is configured and fall back to memory otherwise.
  const rateLimitStore = createAuthRateLimitStore({
    env,
    defaultPrefix: rateLimitPrefixFromAppName(appName),
  });

  return betterAuth({
    appName,
    // On when NODE_ENV=production (Vercel production and preview, and
    // `next start` in CI), off in dev and unit tests, matching Better Auth's
    // default. Read from `env` so it can be tested.
    rateLimit: {
      enabled: env.NODE_ENV === "production",
      customStorage: rateLimitStore,
    },
    baseURL: resolveAuthBaseUrl(productionUrl, env),
    trustedOrigins: [
      ...new Set([
        productionUrl,
        ...resolvePreviewOrigins(env),
        ...extraTrustedOrigins,
      ]),
    ],
    database,
    secret,
    socialProviders,
    // RDC: Prisma @@map("user_session") vs Better Auth "UserSession" probe.
    // RDC: disable __Secure- cookie names for local/CI e2e (HTTP loopback).
    advanced: {
      database: {
        validateSchema: false,
      },
      ...(process.env.EXPOSE_TESTING_API === "1" && process.env.VERCEL !== "1"
        ? { useSecureCookies: false as const }
        : {}),
    },
    session: {
      ...(sessionModelName ? { modelName: sessionModelName } : {}),
      // Refresh only via proxy / route handlers / client POST — never from RSC GET.
      deferSessionRefresh: true,
      cookieCache: {
        enabled: true,
        maxAge: 300,
      },
    },
    // RDC: always pass additionalFields so session.user.role stays typed.
    user: {
      additionalFields: userAdditionalFields,
    },
    ...(onError ? { onAPIError: { onError } } : {}),
    ...(emailOtp ? { disabledPaths: [...EMAIL_OTP_DISABLED_PATHS] } : {}),
    plugins: [
      ...(emailOtp
        ? [
            // Order matters: before hooks run in this order. The email lockout
            // comes first so over-limit requests stop before the allowlist and
            // admin guard do any lookup.
            createOtpEmailLockoutPlugin({
              store: rateLimitStore,
              normalizeEmail: normalizeOtpEmail,
            }),
            ...createEmailOtpPlugins(emailOtp, appName),
            otpAdminGuardPlugin,
          ]
        : []),
      nextCookies(),
    ],
  });
}
