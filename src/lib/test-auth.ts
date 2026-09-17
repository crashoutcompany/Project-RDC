// shared:test-auth v2
import { constantTimeEqual, makeSignature } from "better-auth/crypto";
import prisma from "prisma/db";
import { auth } from "@/lib/auth";
import { TEST_AUTH_USER } from "@/lib/auth/config";
import type { E2EEnvironment } from "@/lib/e2e-env";
import { isTestingApiExposed } from "@/lib/e2e-env";

/** Header agents send when minting a tester session. */
export const TEST_AUTH_HEADER = "x-test-auth-secret";

export type TestAuthEnv = E2EEnvironment & {
  NODE_ENV?: string;
  TEST_AUTH_SECRET?: string;
  VERCEL_ENV?: string;
};

export type TestAuthDecision =
  | { allow: true }
  | { allow: false; status: 401 | 404 };

function currentTestAuthEnv(): TestAuthEnv {
  return {
    EXPOSE_TESTING_API: process.env.EXPOSE_TESTING_API,
    NODE_ENV: process.env.NODE_ENV,
    TEST_AUTH_SECRET: process.env.TEST_AUTH_SECRET,
    VERCEL: process.env.VERCEL,
    VERCEL_ENV: process.env.VERCEL_ENV,
  };
}

function readEnvValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Treat unset / whitespace-only values as missing. Never log the raw secret. */
export function readTestAuthSecret(secret: string | undefined): string | null {
  return readEnvValue(secret);
}

/**
 * RDC policy (stricter than blue preview auto-enable): require
 * EXPOSE_TESTING_API=1 and never enable on Vercel production. Preview/prod
 * builds also omit the route via isTestingApiExposed() (VERCEL=1).
 */
export function isTestAuthEnabled(
  env: TestAuthEnv = currentTestAuthEnv(),
): boolean {
  if (readTestAuthSecret(env.TEST_AUTH_SECRET) === null) return false;

  const vercelEnv = readEnvValue(env.VERCEL_ENV);
  if (vercelEnv === "production") return false;

  return isTestingApiExposed(env);
}

export function isValidTestAuthSecret(
  providedSecret: string | null,
  env: TestAuthEnv = currentTestAuthEnv(),
): boolean {
  const expected = readTestAuthSecret(env.TEST_AUTH_SECRET);
  return Boolean(expected) && constantTimeEqual(providedSecret ?? "", expected!);
}

export function evaluateTestAuthRequest(
  headerValue: string | null,
  env: TestAuthEnv = currentTestAuthEnv(),
): TestAuthDecision {
  if (!isTestAuthEnabled(env)) {
    return { allow: false, status: 404 };
  }

  const expected = readTestAuthSecret(env.TEST_AUTH_SECRET);
  if (!expected) {
    return { allow: false, status: 404 };
  }

  if (!constantTimeEqual(headerValue ?? "", expected)) {
    return { allow: false, status: 401 };
  }

  return { allow: true };
}

export async function createTesterSession() {
  const user = await prisma.user.upsert({
    where: { email: TEST_AUTH_USER.email },
    update: {
      name: TEST_AUTH_USER.name,
      emailVerified: true,
      role: TEST_AUTH_USER.role,
    },
    create: {
      ...TEST_AUTH_USER,
      emailVerified: true,
    },
  });

  const context = await auth.$context;
  const session = await context.internalAdapter.createSession(user.id);
  const signature = await makeSignature(session.token, context.secret);
  const sessionCookie = context.authCookies.sessionToken;

  return {
    cookieName: sessionCookie.name,
    cookieValue: `${session.token}.${signature}`,
    cookieOptions: sessionCookie.attributes,
    expiresAt: session.expiresAt,
    user,
  };
}
