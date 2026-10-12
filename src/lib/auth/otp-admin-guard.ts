import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";

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
 * never reveals that an account exists. A failed user lookup throws and the
 * request is rejected (fail closed). A new allowlisted email has no account yet,
 * so it passes and gets a plain user with no admin role.
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

          const existing = await ctx.context.internalAdapter.findUserByEmail(
            email.trim().toLowerCase(),
            { includeAccounts: true },
          );
          if (
            existing &&
            (isAdminAccount(existing.user as { role?: unknown }) ||
              existing.accounts.length > 0)
          ) {
            throw APIError.from("BAD_REQUEST", {
              code: "INVALID_OTP",
              message: "Invalid OTP",
            });
          }
        }),
      },
    ],
  },
} satisfies BetterAuthPlugin;
