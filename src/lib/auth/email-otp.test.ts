import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { betterAuth as realBetterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { userAdditionalFields } from "./config";
import { createAuth } from "./create-auth";
import {
  EMAIL_OTP_ALLOWED_ATTEMPTS,
  EMAIL_OTP_EXPIRES_IN_SECONDS,
  EMAIL_OTP_LENGTH,
  isEmailOtpEnabled,
  isOtpEmailAllowed,
  parseOtpAllowlist,
  resolveEmailOtpConfig,
  sendSignInOtpEmail,
} from "./email-otp";

const { send } = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: "email-id" }, error: null })),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function Resend() {
    return { emails: { send } };
  }),
}));

const SECRET = "test-better-auth-secret-at-least-32-characters";
const ORIGIN = "http://localhost:3000";
const BOT_EMAIL = "grok-bot@example.com";
const OTHER_EMAIL = "someone@example.com";

const OTP_ENV = {
  BETTER_AUTH_SECRET: SECRET,
  BETTER_AUTH_URL: ORIGIN,
  NODE_ENV: "test",
  AUTH_OTP_ALLOWED_EMAILS: ` Grok-Bot@Example.com , ,`,
  AUTH_EMAIL_FROM: "Project RDC <auth@rdcstats.com>",
  RESEND_API_KEY: "re_test",
};

type MemoryDb = Record<string, Record<string, unknown>[]>;

function buildAuth(env: Record<string, string> = OTP_ENV) {
  // The global better-auth mock is fine for unit tests; these need the real one.
  vi.mocked(betterAuth).mockImplementation(
    realBetterAuth as unknown as typeof betterAuth,
  );
  vi.mocked(nextCookies).mockReturnValue({ id: "next-cookies" } as never);

  const db: MemoryDb = { user: [], session: [], account: [], verification: [] };
  const auth = createAuth({
    appName: "Project RDC",
    database: memoryAdapter(db),
    env,
    productionUrl: ORIGIN,
    userAdditionalFields,
  }) as unknown as {
    handler: (request: Request) => Promise<Response>;
    options: { plugins: { id: string }[] };
    api: {
      createVerificationOTP: (input: {
        body: { email: string; type: "sign-in" };
      }) => Promise<string>;
    };
  };

  return { auth, db };
}

function post(
  auth: ReturnType<typeof buildAuth>["auth"],
  path: string,
  body: Record<string, unknown>,
) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify(body),
    }),
  );
}

function sentCode(): string {
  const [message] = send.mock.calls.at(-1) as unknown as [{ text: string }];
  const code = /\b(\d{6})\b/.exec(message.text)?.[1];
  if (!code) throw new Error("no code in email");
  return code;
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("parseOtpAllowlist", () => {
  it("splits on commas, trims, lowercases, drops empties and dedupes", () => {
    expect(parseOtpAllowlist(" A@x.com,, b@Y.com ,a@x.com, ")).toEqual([
      "a@x.com",
      "b@y.com",
    ]);
    expect(parseOtpAllowlist(undefined)).toEqual([]);
    expect(parseOtpAllowlist(" , ")).toEqual([]);
  });
});

describe("isOtpEmailAllowed", () => {
  it("matches case-insensitively and rejects everything else", () => {
    const allowlist = [BOT_EMAIL];
    expect(isOtpEmailAllowed(" GROK-bot@example.com ", allowlist)).toBe(true);
    expect(isOtpEmailAllowed(OTHER_EMAIL, allowlist)).toBe(false);
    expect(isOtpEmailAllowed("", allowlist)).toBe(false);
  });
});

describe("resolveEmailOtpConfig", () => {
  it("is disabled without an allowlist", () => {
    const env = { ...OTP_ENV, AUTH_OTP_ALLOWED_EMAILS: "" };
    expect(resolveEmailOtpConfig(env, true)).toBeNull();
    expect(isEmailOtpEnabled(env)).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("is disabled with a warning when sending isn't configured", () => {
    const env = { ...OTP_ENV, AUTH_EMAIL_FROM: " " };
    expect(resolveEmailOtpConfig(env, true)).toBeNull();
    expect(isEmailOtpEnabled(env)).toBe(false);
    expect(console.warn).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledWith(
      "[auth] email OTP sign-in is disabled: set AUTH_OTP_ALLOWED_EMAILS, RESEND_API_KEY and AUTH_EMAIL_FROM.",
    );
  });

  it("is enabled with an allowlist, Resend key and sender", () => {
    expect(resolveEmailOtpConfig(OTP_ENV, true)).toEqual({
      allowlist: [BOT_EMAIL],
      from: OTP_ENV.AUTH_EMAIL_FROM,
      resendApiKey: OTP_ENV.RESEND_API_KEY,
    });
    expect(isEmailOtpEnabled(OTP_ENV)).toBe(true);
  });

  it("uses tight OTP defaults", () => {
    expect(EMAIL_OTP_EXPIRES_IN_SECONDS).toBe(300);
    expect(EMAIL_OTP_ALLOWED_ATTEMPTS).toBe(3);
    expect(EMAIL_OTP_LENGTH).toBe(6);
  });
});

describe("sendSignInOtpEmail", () => {
  it("sends a plain-text code from the configured sender", async () => {
    const config = resolveEmailOtpConfig(OTP_ENV, false)!;
    await sendSignInOtpEmail(config, {
      appName: "Project RDC",
      email: BOT_EMAIL,
      otp: "123456",
    });

    expect(send).toHaveBeenCalledWith({
      from: OTP_ENV.AUTH_EMAIL_FROM,
      to: BOT_EMAIL,
      subject: "Project RDC sign-in code",
      text: "Your Project RDC sign-in code is 123456. It expires in 5 minutes.",
    });
  });
});

describe("email OTP allowlist enforcement", () => {
  it("sends nothing to a non-listed email but returns the same response", async () => {
    const { auth } = buildAuth();

    const listed = await post(auth, "/email-otp/send-verification-otp", {
      email: BOT_EMAIL,
      type: "sign-in",
    });
    expect(send).toHaveBeenCalledTimes(1);
    send.mockClear();

    const unlisted = await post(auth, "/email-otp/send-verification-otp", {
      email: OTHER_EMAIL,
      type: "sign-in",
    });

    expect(unlisted.status).toBe(listed.status);
    expect(await unlisted.json()).toEqual(await listed.json());
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects sign-in for a non-listed email even with a valid code", async () => {
    const { auth, db } = buildAuth();
    const otp = await auth.api.createVerificationOTP({
      body: { email: OTHER_EMAIL, type: "sign-in" },
    });

    const response = await post(auth, "/sign-in/email-otp", {
      email: OTHER_EMAIL,
      otp,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_OTP" });
    expect(db.user).toHaveLength(0);
    expect(db.session).toHaveLength(0);
  });

  it("never sends codes for OTP types other than sign-in", async () => {
    const { auth } = buildAuth();

    for (const type of ["email-verification", "forget-password"]) {
      const response = await post(auth, "/email-otp/send-verification-otp", {
        email: BOT_EMAIL,
        type,
      });
      expect(response.status).toBe(200);
    }

    expect(send).not.toHaveBeenCalled();
  });

  it("rejects non-listed emails on the verify paths", async () => {
    const { auth } = buildAuth();
    const otp = await auth.api.createVerificationOTP({
      body: { email: OTHER_EMAIL, type: "sign-in" },
    });

    for (const path of [
      "/email-otp/check-verification-otp",
      "/email-otp/verify-email",
    ]) {
      const response = await post(auth, path, {
        email: OTHER_EMAIL,
        otp,
        type: "sign-in",
      });
      expect(response.status, path).toBe(400);
      expect(await response.json()).toMatchObject({ code: "INVALID_OTP" });
    }
  });

  it("signs in a listed email as a least-privilege user", async () => {
    const { auth, db } = buildAuth();

    const sendResponse = await post(auth, "/email-otp/send-verification-otp", {
      email: "GROK-BOT@example.com",
      type: "sign-in",
    });
    expect(sendResponse.status).toBe(200);
    expect(send).toHaveBeenCalledWith({
      from: OTP_ENV.AUTH_EMAIL_FROM,
      to: BOT_EMAIL,
      subject: "Project RDC sign-in code",
      text: expect.stringContaining("It expires in 5 minutes."),
    });

    const response = await post(auth, "/sign-in/email-otp", {
      email: BOT_EMAIL,
      otp: sentCode(),
      role: "admin",
    });

    // First sign-in creates the user; a client-supplied role is ignored.
    expect(response.status).toBe(200);
    expect(db.user).toEqual([
      expect.objectContaining({
        email: BOT_EMAIL,
        emailVerified: true,
        role: "user",
      }),
    ]);

    await post(auth, "/email-otp/send-verification-otp", {
      email: BOT_EMAIL,
      type: "sign-in",
    });
    const signIn = await post(auth, "/sign-in/email-otp", {
      email: BOT_EMAIL,
      otp: sentCode(),
    });

    // Returning sign-in reuses the same least-privilege user.
    expect(signIn.status).toBe(200);
    expect(signIn.headers.get("set-cookie")).toContain("session_token");
    expect(db.user).toHaveLength(1);
    expect(db.user[0]).toMatchObject({ role: "user" });
    expect(db.session).toHaveLength(2);
  });

  it("burns the code after three wrong attempts", async () => {
    const { auth } = buildAuth();
    await post(auth, "/email-otp/send-verification-otp", {
      email: BOT_EMAIL,
      type: "sign-in",
    });
    const otp = sentCode();
    const wrong = otp === "000000" ? "111111" : "000000";

    for (let attempt = 0; attempt < 3; attempt++)
      expect(
        (
          await post(auth, "/sign-in/email-otp", {
            email: BOT_EMAIL,
            otp: wrong,
          })
        ).status,
      ).toBe(400);

    const response = await post(auth, "/sign-in/email-otp", {
      email: BOT_EMAIL,
      otp,
    });
    expect(response.status).toBe(403);
  });
});
