import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  formCsrfMiddleware,
} from "better-auth/api";

import { normalizeOtpEmail } from "./email-otp";

/**
 * Routes that consume an OTP and act on an existing account for a given
 * `email`. Email-code sign-in is for allowlisted bots, so it must never open an
 * admin's account, and the same is true for the other consuming routes.
 */
const ADMIN_GUARDED_OTP_PATHS = new Set([
  "/sign-in/email-otp",
  "/email-otp/verify-email",
  "/email-otp/check-verification-otp",
  "/email-otp/reset-password",
]);

const SEND_OTP_PATH = "/email-otp/send-verification-otp";

/** Lookups run this many times in total before the guard fails closed. */
const LOOKUP_ATTEMPTS = 2;

type GuardContext = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0];

export function isAdminAccount(
  user: { role?: unknown } | null | undefined,
): boolean {
  return user?.role === "admin";
}

/**
 * Refuses OTP flows that would act on an existing admin account, or on any
 * account a person already signs into another way (OAuth or password), even
 * when that email lands on the allowlist by mistake. A user created by an
 * email-code sign-in has no linked accounts, so bots keep signing in. The refusal reuses the
 * generic INVALID_OTP error that every other failure returns, so the response
 * never reveals that an account exists. A failed user lookup is retried once,
 * then rejected (fail closed). A new allowlisted email has no account yet, so
 * it passes and gets a plain user with no admin role.
 *
 * On send, a blocked sign-in returns the endpoint's own `{ success: true }`
 * without storing a code or emailing one, so the response matches an unlisted
 * email's.
 */
export const otpAdminGuardPlugin = {
  id: "email-otp-admin-guard",
  hooks: {
    before: [
      {
        matcher: (context) => ADMIN_GUARDED_OTP_PATHS.has(context.path ?? ""),
        handler: createAuthMiddleware(async (ctx) => {
          const email = (ctx.body as { email?: unknown } | undefined)?.email;
          if (typeof email !== "string") return;

          if (await isBlockedOtpAccount(ctx, normalizeOtpEmail(email))) {
            throw APIError.from("BAD_REQUEST", {
              code: "INVALID_OTP",
              message: "Invalid OTP",
            });
          }
        }),
      },
      {
        matcher: (context) => context.path === SEND_OTP_PATH,
        handler: createAuthMiddleware(async (ctx) => {
          const body = ctx.body as
            { email?: unknown; type?: unknown } | undefined;
          // Only sign-in sends a code. Other types already send nothing, and
          // change-email must keep its own error, so they pass through.
          if (body?.type !== "sign-in" || typeof body.email !== "string") {
            return;
          }

          if (await isBlockedOtpAccount(ctx, normalizeOtpEmail(body.email))) {
            // Same CSRF check the endpoint runs first, then the same body and
            // status it returns for an unlisted email. Skipping the endpoint
            // also skips storing a code.
            await formCsrfMiddleware(ctx);
            return ctx.json({ success: true });
          }
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;

/** Loads the user for a normalized email and that user's accounts by `userId`. */
async function findOtpUser(ctx: GuardContext, email: string) {
  const internal = ctx.context.internalAdapter;
  const found = await internal.findUserByEmail(email);
  if (!found) return null;
  const accounts = await internal.findAccounts(found.user.id);
  return { user: found.user as { role?: unknown }, accounts };
}

/**
 * Retries the user and account lookup once. If every attempt fails, the error
 * is logged and rethrown, so the request fails and the sign-in or send is
 * denied. The email is not logged.
 */
async function isBlockedOtpAccount(
  ctx: GuardContext,
  email: string,
): Promise<boolean> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= LOOKUP_ATTEMPTS; attempt += 1) {
    try {
      const found = await findOtpUser(ctx, email);
      return (
        found !== null &&
        (isAdminAccount(found.user) || found.accounts.length > 0)
      );
    } catch (error) {
      lastError = error;
    }
  }
  console.error("otp_guard_lookup_failed", {
    attempts: LOOKUP_ATTEMPTS,
    error: lastError,
  });
  throw lastError;
}
