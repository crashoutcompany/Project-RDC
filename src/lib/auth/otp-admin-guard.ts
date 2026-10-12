import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  formCsrfMiddleware,
} from "better-auth/api";

import {
  logOtpFailure,
  normalizeOtpEmail,
  otpEmailLogHash,
} from "./email-otp";

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

type OtpCandidate = {
  userId: string;
  role: unknown;
  accounts: readonly unknown[];
};

type Lookup =
  | { failed: false; candidate: OtpCandidate | null }
  | { failed: true };

export function isAdminAccount(
  user: { role?: unknown } | null | undefined,
): boolean {
  return user?.role === "admin";
}

/**
 * A blocked account is an admin, or any account a person already signs into
 * another way (OAuth or password), even when that email lands on the allowlist
 * by mistake. A user created by an email-code sign-in has no linked accounts,
 * so bots keep signing in.
 */
function isBlockedCandidate(candidate: OtpCandidate): boolean {
  return isAdminAccount({ role: candidate.role }) || candidate.accounts.length > 0;
}

/** Loads the user for a normalized email and that user's accounts by `userId`. */
async function findOtpCandidate(
  ctx: GuardContext,
  email: string,
): Promise<OtpCandidate | null> {
  const internal = ctx.context.internalAdapter;
  const found = await internal.findUserByEmail(email);
  if (!found) return null;
  const user = found.user as { id: string; role?: unknown };
  const accounts = await internal.findAccounts(user.id);
  return { userId: user.id, role: user.role, accounts };
}

/** Error name and message, with the address removed in case a driver echoes it. */
function describeLookupError(error: unknown, email: string) {
  const name = error instanceof Error ? error.name : typeof error;
  const message = error instanceof Error ? error.message : "";
  return { name, message: message.split(email).join("[redacted]") };
}

/**
 * Retries the user and account lookup once. If every attempt fails, the guard
 * logs the failure by hash and returns `{ failed: true }`. The caller then
 * answers as if the address were unlisted, so a lookup failure does not reveal
 * whether the address is listed. The raw email is never logged.
 */
async function lookupOtpCandidate(
  ctx: GuardContext,
  email: string,
  logSecret: string | undefined,
): Promise<Lookup> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= LOOKUP_ATTEMPTS; attempt += 1) {
    try {
      return {
        failed: false,
        candidate: await findOtpCandidate(ctx, email),
      };
    } catch (error) {
      lastError = error;
    }
  }
  console.error("otp_guard_lookup_failed", {
    attempts: LOOKUP_ATTEMPTS,
    emailHash: otpEmailLogHash(email, logSecret),
    error: describeLookupError(lastError, email),
  });
  return { failed: true };
}

function invalidOtpError(): APIError {
  return APIError.from("BAD_REQUEST", {
    code: "INVALID_OTP",
    message: "Invalid OTP",
  });
}

/**
 * Builds the admin guard. `logSecret` keys the email hash in logs, the same
 * secret passed to `createEmailOtpPlugins`.
 *
 * Blocked and lookup-failed requests get the same answer as an unlisted
 * address. Sign-in returns the INVALID_OTP error of a wrong code. Send returns
 * the endpoint's own `{ success: true }` without storing or emailing a code.
 * The send path keeps the CSRF check the endpoint would run first. The check
 * runs before the code is consumed.
 */
export function createOtpAdminGuardPlugin(
  options: { logSecret?: string } = {},
): BetterAuthPlugin {
  const { logSecret } = options;

  return {
    id: "email-otp-admin-guard",
    hooks: {
      before: [
        {
          matcher: (context) => ADMIN_GUARDED_OTP_PATHS.has(context.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const raw = (ctx.body as { email?: unknown } | undefined)?.email;
            if (typeof raw !== "string") return;
            const email = normalizeOtpEmail(raw);
            const lookup = await lookupOtpCandidate(ctx, email, logSecret);
            if (lookup.failed) throw invalidOtpError();
            if (lookup.candidate && isBlockedCandidate(lookup.candidate)) {
              logOtpFailure("otp_account_blocked", {
                email,
                userId: lookup.candidate.userId,
                logSecret,
              });
              throw invalidOtpError();
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
            const email = normalizeOtpEmail(body.email);
            const lookup = await lookupOtpCandidate(ctx, email, logSecret);
            if (!lookup.failed) {
              if (!lookup.candidate || !isBlockedCandidate(lookup.candidate)) {
                return;
              }
              logOtpFailure("otp_account_blocked", {
                email,
                userId: lookup.candidate.userId,
                logSecret,
              });
            }
            // Lookup failure and blocked account take the same path: no code
            // is stored or emailed, and the response matches an unlisted
            // address. Skipping the endpoint also skips storing a code.
            await formCsrfMiddleware(ctx);
            return ctx.json({ success: true });
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
