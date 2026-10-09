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

/**
 * Routes that consume an OTP for a given `email`. Unlisted emails are rejected
 * here before any code check runs.
 */
const GUARDED_OTP_PATHS = new Set([
  "/sign-in/email-otp",
  "/email-otp/verify-email",
  "/email-otp/check-verification-otp",
  "/email-otp/reset-password",
]);

/** Comma-separated, trimmed, lowercased, empties dropped, deduped. */
export function parseOtpAllowlist(raw: string | undefined): string[] {
  return [
    ...new Set(
      (raw ?? "")
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

/**
 * Rejects unlisted emails on every OTP-consuming route. The error matches the
 * plugin's own wrong-code error, so it does not reveal the allowlist.
 */
function emailOtpAllowlistGuard(
  allowlist: readonly string[],
): BetterAuthPlugin {
  return {
    id: "email-otp-allowlist",
    hooks: {
      before: [
        {
          matcher: (context) => GUARDED_OTP_PATHS.has(context.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => {
            const email = (ctx.body as { email?: unknown } | undefined)?.email;
            if (
              typeof email !== "string" ||
              !isOtpEmailAllowed(email, allowlist)
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
  };
}

export function createEmailOtpPlugins(
  config: EmailOtpConfig,
  appName: string,
): BetterAuthPlugin[] {
  return [
    emailOTP({
      otpLength: EMAIL_OTP_LENGTH,
      expiresIn: EMAIL_OTP_EXPIRES_IN_SECONDS,
      allowedAttempts: EMAIL_OTP_ALLOWED_ATTEMPTS,
      disableSignUp: false,
      // Unlisted emails and non-sign-in types get the same success response
      // from the endpoint, but no email is sent.
      async sendVerificationOTP({ email, otp, type }) {
        if (
          type !== "sign-in" ||
          !isOtpEmailAllowed(email, config.allowlist)
        ) {
          return;
        }
        await sendSignInOtpEmail(config, { appName, email, otp });
      },
    }),
    emailOtpAllowlistGuard(config.allowlist),
  ];
}
