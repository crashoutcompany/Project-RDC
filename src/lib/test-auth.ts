// shared:test-auth v1
import { createHash, timingSafeEqual } from "node:crypto";
import { makeSignature } from "better-auth/crypto";
import prisma from "prisma/db";
import { auth } from "@/lib/auth";
import { TEST_AUTH_USER } from "@/lib/auth/config";

export function isTestAuthEnabled() {
  return (
    process.env.EXPOSE_TESTING_API === "1" &&
    process.env.VERCEL !== "1" &&
    process.env.VERCEL_ENV !== "production"
  );
}

export function isValidTestAuthSecret(providedSecret: string | null) {
  const expectedSecret = process.env.TEST_AUTH_SECRET;
  const providedDigest = createHash("sha256")
    .update(providedSecret ?? "")
    .digest();
  const expectedDigest = createHash("sha256")
    .update(expectedSecret ?? "")
    .digest();

  return Boolean(expectedSecret) && timingSafeEqual(providedDigest, expectedDigest);
}

export function readBearerToken(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length);
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
