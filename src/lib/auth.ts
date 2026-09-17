// shared:auth v1
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import prisma from "prisma/db";
import {
  AUTH_ORIGINS,
  type SocialProvider,
} from "@/lib/auth/config";
import posthog from "@/posthog/server-init";

const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_ENV === "production"
    ? AUTH_ORIGINS.production
    : AUTH_ORIGINS.local);

const trustedOrigins = [
  ...new Set(
    [
      baseURL,
      AUTH_ORIGINS.production,
      AUTH_ORIGINS.productionWww,
      AUTH_ORIGINS.vercelProject,
      AUTH_ORIGINS.vercelPreviewWildcard,
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
    ].filter((origin): origin is string => Boolean(origin)),
  ),
];

const githubCredentials =
  process.env.AUTH_GITHUB_ID && process.env.AUTH_GITHUB_SECRET
    ? {
        clientId: process.env.AUTH_GITHUB_ID,
        clientSecret: process.env.AUTH_GITHUB_SECRET,
      }
    : undefined;

const googleCredentials =
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
    ? {
        clientId: process.env.AUTH_GOOGLE_ID,
        clientSecret: process.env.AUTH_GOOGLE_SECRET,
      }
    : undefined;

export const enabledSocialProviders: SocialProvider[] = [
  ...(githubCredentials ? (["github"] as const) : []),
  ...(googleCredentials ? (["google"] as const) : []),
];

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  secret: process.env.BETTER_AUTH_SECRET,
  session: {
    modelName: "UserSession",
    cookieCache: {
      enabled: true,
      maxAge: 300,
    },
  },
  onAPIError: {
    onError(error, ctx) {
      console.error(error);
      posthog.captureException(error, "auth-error");
    },
  },
  baseURL,
  trustedOrigins,
  socialProviders: {
    ...(githubCredentials ? { github: githubCredentials } : {}),
    ...(googleCredentials ? { google: googleCredentials } : {}),
  },
  plugins: [nextCookies()],
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
