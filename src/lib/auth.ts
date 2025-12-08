import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import prisma from "prisma/db";
import config from "@/lib/config";
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
    // Map models if needed, but we updated schema to match better-auth expectations mostly.
    // We renamed Session to UserSession in Prisma.
    // modelMap: {
    //   Session: "UserSession",
    //   User: "User",
    //   Account: "Account",
    //   Verification: "Verification",
    // },
  }),
  onAPIError: {
    onError(error, ctx) {
      console.error(error);
    },
  },
  socialProviders: {
    github: {
      clientId: config.AUTH_GITHUB_ID!,
      clientSecret: config.AUTH_GITHUB_SECRET!,
      redirectUri: "http://localhost:3000/api/auth/callback/github",
      // Map profile to user fields if needed
    },
    google: {
      clientId: config.AUTH_GOOGLE_ID!,
      clientSecret: config.AUTH_GOOGLE_SECRET!,
      redirectUri: "http://localhost:3000/api/auth/callback/google",
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
