import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "prisma/db";
import posthog from "@/posthog/server-init";
import {
  AUTH_ORIGINS,
  APP_NAME,
  PRODUCTION_URL,
  userAdditionalFields,
} from "@/lib/auth/config";
import {
  createAuth,
  getEnabledSocialProviders,
} from "@/lib/auth/create-auth";

export type { SocialProviderId } from "@/lib/auth/create-auth";

export const enabledSocialProviders = getEnabledSocialProviders();

export const auth = createAuth({
  appName: APP_NAME,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  productionUrl: PRODUCTION_URL,
  extraTrustedOrigins: [
    AUTH_ORIGINS.productionWww,
    AUTH_ORIGINS.vercelProject,
  ],
  sessionModelName: "UserSession",
  userAdditionalFields,
  onError(error) {
    console.error(error);
    posthog.captureException(error, "auth-error");
  },
});

export type Session = typeof auth.$Infer.Session;
