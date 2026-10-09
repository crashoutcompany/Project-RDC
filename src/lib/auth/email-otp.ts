// shared:email-otp v1
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
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

/** OTP paths that accept a code; non-allowlisted emails are rejected here. */
const GUARDED_PATHS = new Set([
  "/sign-in/email-otp",
  "/email-otp/verify-email",
  "/email-otp/check-verification-otp",
]);

/** Comma-separated, trimmed, lowercased, empties dropped, deduped. */
export function parseOtpAllowlist(raw: string | undefined): string[] {
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}

export function isOtpEmailAllowed(
  email: string,
  allowlist: readonly string[],
): boolean {
  const normalized = email.trim().toLowerCase();
  return normalized !== "" && allowlist.includes(normalized);
}

/**
 * Email OTP is enabled only with a non-empty allowlist AND a Resend key and
 * sender. Otherwise null, so the plugin and its routes are never registered.
 */
export function resolveEmailOtpConfig(
  env: EmailOtpEnv,
  warnOnPartialConfig: boolean,
): EmailOtpConfig | null {
  const allowlist = parseOtpAllowlist(env.AUTH_OTP_ALLOWED_EMAILS);
  const resendApiKey = env.RESEND_API_KEY?.trim();
  const from = env.AUTH_EMAIL_FROM?.trim();

  if (allowlist.length > 0 && resendApiKey && from)
    return { allowlist, from, resendApiKey };

  if (warnOnPartialConfig && allowlist.length > 0)
    console.warn(
      "[auth] email OTP sign-in is disabled: set AUTH_OTP_ALLOWED_EMAILS, RESEND_API_KEY and AUTH_EMAIL_FROM.",
    );
  return null;
}

export function isEmailOtpEnabled(
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
    console.error("[auth] failed to send sign-in code", error);
    throw APIError.fromStatus("INTERNAL_SERVER_ERROR", {
      message: "Unable to send sign-in code",
    });
  }
}

/**
 * Security boundary for email OTP sign-in:
 * - sending is a silent no-op for non-allowlisted emails and for every type
 *   except `sign-in`, while the endpoint still answers `{ success: true }`, so
 *   the allowlist can't be probed;
 * - the guard plugin rejects non-allowlisted emails on the paths that accept a
 *   code, even if a valid code exists.
 */
export function createEmailOtpPlugins(
  config: EmailOtpConfig,
  appName: string,
): BetterAuthPlugin[] {
  const guard: BetterAuthPlugin = {
    id: "email-otp-allowlist",
    hooks: {
      before: [
        {
          matcher: (ctx) => !!ctx.path && GUARDED_PATHS.has(ctx.path),
          handler: createAuthMiddleware(async (ctx) => {
            const email = (ctx.body as { email?: unknown } | undefined)?.email;
            if (
              typeof email !== "string" ||
              !isOtpEmailAllowed(email, config.allowlist)
            )
              throw APIError.from("BAD_REQUEST", {
                code: "INVALID_OTP",
                message: "Invalid OTP",
              });
          }),
        },
      ],
    },
  };

  return [
    emailOTP({
      otpLength: EMAIL_OTP_LENGTH,
      expiresIn: EMAIL_OTP_EXPIRES_IN_SECONDS,
      allowedAttempts: EMAIL_OTP_ALLOWED_ATTEMPTS,
      disableSignUp: false,
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in" || !isOtpEmailAllowed(email, config.allowlist))
          return;
        await sendSignInOtpEmail(config, { appName, email, otp });
      },
    }),
    guard,
  ];
}
