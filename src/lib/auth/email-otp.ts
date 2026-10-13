// shared:email-otp v4
import { createHash, createHmac } from "node:crypto";

import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  formCsrfMiddleware,
  isAPIError,
} from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import { Resend } from "resend";

export type EmailOtpEnv = {
  AUTH_OTP_ALLOWED_EMAILS?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
};

export const EMAIL_OTP_EXPIRES_IN_SECONDS = 300;
export const EMAIL_OTP_ALLOWED_ATTEMPTS = 3;
export const EMAIL_OTP_LENGTH = 6;

export type EmailOtpConfig = {
  allowlist: string[];
  from: string;
  resendApiKey: string;
};

/**
 * Better Auth `disabledPaths` for OTP routes that are not sign-in. They set a
 * password, verify an address, or change an email, and code sign-in does not
 * need them. Spread this into `disabledPaths` only when email OTP is
 * configured, so the routes stay disabled in every environment that uses it.
 */
export const EMAIL_OTP_DISABLED_PATHS: readonly string[] = [
  "/email-otp/reset-password",
  "/email-otp/verify-email",
  "/email-otp/check-verification-otp",
  "/email-otp/request-password-reset",
  "/forget-password/email-otp",
  "/email-otp/request-email-change",
  "/email-otp/change-email",
];

const SEND_PATH = "/email-otp/send-verification-otp";
const SIGN_IN_PATH = "/sign-in/email-otp";
const REQUEST_EMAIL_CHANGE_PATH = "/email-otp/request-email-change";
const CHANGE_EMAIL_PATH = "/email-otp/change-email";

/**
 * Routes that consume an OTP for a given address. Unlisted emails are rejected
 * here before any code check runs. The disabled routes are listed too, so the
 * check still holds if `disabledPaths` is not wired.
 */
const GUARDED_OTP_PATHS = new Set([
  SIGN_IN_PATH,
  "/email-otp/verify-email",
  "/email-otp/check-verification-otp",
  "/email-otp/reset-password",
  REQUEST_EMAIL_CHANGE_PATH,
  CHANGE_EMAIL_PATH,
]);

/** Email-change routes name the target address `newEmail`, not `email`. */
const NEW_EMAIL_PATHS = new Set([REQUEST_EMAIL_CHANGE_PATH, CHANGE_EMAIL_PATH]);

/** The one email rule for every OTP check: trimmed and lowercased. */
export function normalizeOtpEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Reasons written by `logOtpFailure`. None of them carries an address or code. */
export type OtpFailureReason =
  | "otp_expired"
  | "otp_too_many_attempts"
  | "otp_invalid"
  | "otp_unlisted"
  | "otp_guard_lookup_failed"
  | "otp_account_blocked";

/**
 * First 16 hex chars of HMAC-SHA256 over the normalized email, keyed by
 * `logSecret`. Without a secret, plain SHA-256 of the same input. The hash lets
 * logs group attempts on one address without storing the address itself.
 */
export function otpEmailLogHash(email: string, logSecret?: string): string {
  const normalized = normalizeOtpEmail(email);
  const digest = logSecret
    ? createHmac("sha256", logSecret).update(normalized).digest("hex")
    : createHash("sha256").update(normalized).digest("hex");
  return digest.slice(0, 16);
}

/**
 * Logs one OTP failure with a reason and an email hash. The raw address is
 * never passed to the logger.
 */
export function logOtpFailure(
  reason: OtpFailureReason,
  {
    email,
    userId,
    logSecret,
  }: { email?: string; userId?: string; logSecret?: string } = {},
): void {
  console.warn("otp_sign_in_failed", {
    reason,
    emailHash:
      email === undefined ? undefined : otpEmailLogHash(email, logSecret),
    userId,
  });
}

/** Comma-separated, trimmed, lowercased, empties dropped, deduped. */
export function parseOtpAllowlist(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map(normalizeOtpEmail)
        .filter(Boolean),
    ),
  ];
}

export function isOtpEmailAllowed(
  email: string,
  allowlist: readonly string[],
): boolean {
  const normalized = normalizeOtpEmail(email);
  return normalized !== "" && allowlist.includes(normalized);
}

function readValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function resolveEmailOtpConfig(
  env: EmailOtpEnv,
  warnOnPartialConfig: boolean,
): EmailOtpConfig | null {
  const allowlist = parseOtpAllowlist(env.AUTH_OTP_ALLOWED_EMAILS);
  const resendApiKey = readValue(env.RESEND_API_KEY);
  const from = readValue(env.AUTH_EMAIL_FROM);

  if (allowlist.length > 0 && resendApiKey && from) {
    return { allowlist, from, resendApiKey };
  }

  if (warnOnPartialConfig && (allowlist.length > 0 || resendApiKey || from)) {
    console.warn(
      "[auth] email OTP sign-in is disabled: set AUTH_OTP_ALLOWED_EMAILS, RESEND_API_KEY and AUTH_EMAIL_FROM.",
    );
  }

  return null;
}

export function isEmailOtpEnabled(
  // Cast: Next's ProcessEnv shares no declared keys with EmailOtpEnv.
  env: EmailOtpEnv = process.env as EmailOtpEnv,
): boolean {
  return resolveEmailOtpConfig(env, false) !== null;
}

export async function sendSignInOtpEmail(
  config: EmailOtpConfig,
  { appName, email, otp }: { appName: string; email: string; otp: string },
): Promise<void> {
  const resend = new Resend(config.resendApiKey);
  const { error } = await resend.emails.send({
    from: config.from,
    to: email,
    subject: `${appName} sign-in code`,
    text: `Your ${appName} sign-in code is ${otp}. It expires in 5 minutes.`,
  });

  if (error) {
    throw new Error(`[auth] failed to send sign-in code: ${error.message}`);
  }
}

/** The single error every failed code sign-in returns. */
function invalidOtpError(): APIError {
  return APIError.from("BAD_REQUEST", {
    code: "INVALID_OTP",
    message: "Invalid OTP",
  });
}

/**
 * Enforces the allowlist on OTP routes. Listed emails pass through with the
 * email normalized. Every other request is answered before the endpoint runs:
 * - send: an unlisted email or a non-sign-in type gets the endpoint's own
 *   success body, so no verification row is stored and no email is sent;
 * - sign-in and the other OTP-consuming routes: INVALID_OTP, the same error as
 *   a wrong code.
 * Unlisted sign-in attempts are logged by hash, never by address.
 */
function emailOtpAllowlistGuard(
  allowlist: readonly string[],
  logSecret: string | undefined,
): BetterAuthPlugin {
  return {
    id: "email-otp-allowlist",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === SEND_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as { email?: unknown; type?: unknown } | undefined;
            const email =
              typeof body?.email === "string"
                ? normalizeOtpEmail(body.email)
                : "";
            const listed = isOtpEmailAllowed(email, allowlist);
            if (body?.type === "sign-in" && !listed) {
              logOtpFailure("otp_unlisted", { email, logSecret });
            }
            if (!body || body.type !== "sign-in" || !listed) {
              // Same CSRF check the endpoint would run first, then its success body.
              await formCsrfMiddleware(ctx);
              return ctx.json({ success: true });
            }
            return { context: { body: { ...body, email } } };
          }),
        },
        {
          matcher: (context) => GUARDED_OTP_PATHS.has(context.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const body = ctx.body as Record<string, unknown> | undefined;
            const field = NEW_EMAIL_PATHS.has(ctx.path ?? "") ? "newEmail" : "email";
            const raw = body?.[field];
            const email =
              typeof raw === "string" ? normalizeOtpEmail(raw) : "";
            if (!isOtpEmailAllowed(email, allowlist)) {
              logOtpFailure("otp_unlisted", { email, logSecret });
              throw invalidOtpError();
            }
            return { context: { body: { ...body, [field]: email } } };
          }),
        },
      ],
      after: [
        {
          // The plugin's own failure codes (OTP_EXPIRED, TOO_MANY_ATTEMPTS) and
          // body validation errors would reveal whether the address is listed or
          // has a live code. They are logged by reason, then rewritten to
          // INVALID_OTP. Server errors (5xx) are left alone.
          matcher: (context) => context.path === SIGN_IN_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const returned = ctx.context.returned;
            if (!isAPIError(returned) || returned.statusCode >= 500) return;
            const code = (returned.body as { code?: unknown } | undefined)?.code;
            const rawEmail = (ctx.body as { email?: unknown } | undefined)?.email;
            logOtpFailure(
              code === "OTP_EXPIRED"
                ? "otp_expired"
                : code === "TOO_MANY_ATTEMPTS"
                  ? "otp_too_many_attempts"
                  : "otp_invalid",
              {
                email: typeof rawEmail === "string" ? rawEmail : "",
                logSecret,
              },
            );
            // A thrown error keeps the endpoint's own status (403 for too many
            // attempts), so over HTTP return the 400 response directly. Direct
            // server calls have no request and get the APIError.
            if (ctx.request) {
              return Response.json(
                { message: "Invalid OTP", code: "INVALID_OTP" },
                { status: 400 },
              );
            }
            throw invalidOtpError();
          }),
        },
      ],
    },
  };
}

export type EmailOtpPluginOptions = {
  /**
   * Secret that keys the email hash in OTP logs. Without it the hash is plain
   * SHA-256, which is guessable for a known address list.
   */
  logSecret?: string;
};

export function createEmailOtpPlugins(
  config: EmailOtpConfig,
  appName: string,
  options: EmailOtpPluginOptions = {},
): BetterAuthPlugin[] {
  const { logSecret } = options;
  return [
    emailOTP({
      otpLength: EMAIL_OTP_LENGTH,
      expiresIn: EMAIL_OTP_EXPIRES_IN_SECONDS,
      allowedAttempts: EMAIL_OTP_ALLOWED_ATTEMPTS,
      disableSignUp: false,
      // Only a SHA-256 hash is stored, so a database read can't reveal a live code.
      storeOTP: "hashed",
      // Defense in depth: the allowlist hook already answers these requests
      // before a code is stored. This check keeps the plugin safe on its own.
      async sendVerificationOTP({ email, otp, type }) {
        if (
          type !== "sign-in" ||
          !isOtpEmailAllowed(email, config.allowlist)
        ) {
          return;
        }
        try {
          await sendSignInOtpEmail(config, { appName, email, otp });
        } catch (error) {
          // Same response as an unlisted email, so a delivery failure does not
          // reveal which addresses are listed. The failure is logged here.
          console.error("[auth] sign-in code email failed", error);
        }
      },
    }),
    emailOtpAllowlistGuard(config.allowlist, logSecret),
  ];
}
