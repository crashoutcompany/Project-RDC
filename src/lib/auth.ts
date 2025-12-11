import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "prisma/db";
import config from "@/lib/config";
import { nextCookies } from "better-auth/next-js";
import posthog from "@/posthog/server-init";

const baseURL = config.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  session: {
    modelName: "UserSession", // Maps better-auth's session to Prisma's UserSession model
  },
  onAPIError: {
    onError(error, ctx) {
      console.error(error);
      posthog.captureException(error, "auth-error");
    },
  },
  baseURL,
  trustHost: config.AUTH_TRUST_HOST === "true",
  socialProviders: {
    github: {
      clientId: config.AUTH_GITHUB_ID!,
      clientSecret: config.AUTH_GITHUB_SECRET!,
      redirectUri: `${baseURL}/api/auth/callback/github`,
      // Map profile to user fields if needed
    },
    google: {
      clientId: config.AUTH_GOOGLE_ID!,
      clientSecret: config.AUTH_GOOGLE_SECRET!,
      redirectUri: `${baseURL}/api/auth/callback/google`,
      // display: "popup",
    },
  },
  plugins: [
    nextCookies(), // Recommended for Next.js
  ],
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
      },
    },
  },
  hooks: {
    // after: {
    //   createSession: async (session) => {
    //     // valid session created
    //   },
    // },
  },
  // Replacements for allowlist
  // We can implement a middleware or just check session.user.role in actions
});

export type Session = typeof auth.$Infer.Session;
