// RDC aliases bare "better-auth" to a Vitest mock; /minimal is the real factory.
import { betterAuth } from "better-auth/minimal";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EMAIL_OTP_ALLOWED_ATTEMPTS,
  EMAIL_OTP_EXPIRES_IN_SECONDS,
  EMAIL_OTP_LENGTH,
  createEmailOtpPlugins,
  isEmailOtpEnabled,
  isOtpEmailAllowed,
  logOtpFailure,
  otpEmailLogHash,
  parseOtpAllowlist,
  resolveEmailOtpConfig,
  sendSignInOtpEmail,
  type EmailOtpConfig,
  type EmailOtpPluginOptions,
} from "./email-otp";

type SentEmail = { from: string; to: string; subject: string; text: string };

type SendResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};

const sendEmail = vi.hoisted(() =>
  vi.fn<(email: SentEmail) => Promise<SendResult>>(async () => ({
    data: { id: "email-id" },
    error: null,
  })),
);

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendEmail };
  },
}));

const ORIGIN = "http://localhost:3000";
const SECRET = "test-better-auth-secret-at-least-32-characters";
const ENV = {
  AUTH_OTP_ALLOWED_EMAILS: " Bot@Example.com, ,second@example.com ",
  RESEND_API_KEY: "re_test",
  AUTH_EMAIL_FROM: "App <auth@example.com>",
};
const CONFIG: EmailOtpConfig = {
  allowlist: ["bot@example.com"],
  from: "App <auth@example.com>",
  resendApiKey: "re_test",
};

type MemoryDb = {
  user: unknown[];
  session: unknown[];
  account: unknown[];
  verification: Array<{ value: string; expiresAt?: Date }>;
};

function emptyDb(): MemoryDb {
  return { user: [], session: [], account: [], verification: [] };
}

function buildAuth(
  db: MemoryDb = emptyDb(),
  options: EmailOtpPluginOptions = {},
) {
  return betterAuth({
    appName: "App",
    baseURL: ORIGIN,
    secret: SECRET,
    trustedOrigins: [ORIGIN],
    database: memoryAdapter(db),
    rateLimit: { enabled: false },
    plugins: createEmailOtpPlugins(CONFIG, "App", options),
  });
}

type TestAuth = ReturnType<typeof buildAuth>;

function post(auth: TestAuth, path: string, body: Record<string, unknown>) {
  return auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN },
      body: JSON.stringify(body),
    }),
  );
}

function sendCode(auth: TestAuth, email: string, type = "sign-in") {
  return post(auth, "/email-otp/send-verification-otp", { email, type });
}

function lastSentCode(): string {
  const text = sendEmail.mock.lastCall?.[0].text ?? "";
  return text.match(/\b(\d{6})\b/)?.[1] ?? "";
}

beforeEach(() => {
  sendEmail.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseOtpAllowlist", () => {
  it("trims, lowercases, drops empties and dedupes", () => {
    expect(parseOtpAllowlist(" A@x.com,,b@X.com , a@x.com ,")).toEqual([
      "a@x.com",
      "b@x.com",
    ]);
  });

  it("returns an empty list when unset or blank", () => {
    expect(parseOtpAllowlist(undefined)).toEqual([]);
    expect(parseOtpAllowlist(" , ")).toEqual([]);
  });
});

describe("isOtpEmailAllowed", () => {
  it("matches listed emails case-insensitively", () => {
    expect(isOtpEmailAllowed(" BOT@example.com", ["bot@example.com"])).toBe(
      true,
    );
    expect(isOtpEmailAllowed("other@example.com", ["bot@example.com"])).toBe(
      false,
    );
    expect(isOtpEmailAllowed("", [""])).toBe(false);
  });
});

describe("resolveEmailOtpConfig", () => {
  it("returns the config when the allowlist and Resend are configured", () => {
    expect(resolveEmailOtpConfig(ENV, false)).toEqual({
      allowlist: ["bot@example.com", "second@example.com"],
      from: "App <auth@example.com>",
      resendApiKey: "re_test",
    });
  });

  it("returns null when any variable is missing", () => {
    expect(
      resolveEmailOtpConfig({ ...ENV, AUTH_OTP_ALLOWED_EMAILS: " , " }, false),
    ).toBeNull();
    expect(
      resolveEmailOtpConfig({ ...ENV, RESEND_API_KEY: "" }, false),
    ).toBeNull();
    expect(
      resolveEmailOtpConfig({ ...ENV, AUTH_EMAIL_FROM: undefined }, false),
    ).toBeNull();
  });

  it("warns on partial configuration", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(
      resolveEmailOtpConfig(
        { AUTH_OTP_ALLOWED_EMAILS: "bot@example.com" },
        true,
      ),
    ).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "[auth] email OTP sign-in is disabled: set AUTH_OTP_ALLOWED_EMAILS, RESEND_API_KEY and AUTH_EMAIL_FROM.",
    );
  });

  it("does not warn when nothing is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    expect(resolveEmailOtpConfig({}, true)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("isEmailOtpEnabled", () => {
  it("reflects whether the config resolves", () => {
    expect(isEmailOtpEnabled(ENV)).toBe(true);
    expect(isEmailOtpEnabled({ ...ENV, AUTH_OTP_ALLOWED_EMAILS: "" })).toBe(
      false,
    );
  });
});

describe("sendSignInOtpEmail", () => {
  it("sends a plain-text code email via Resend", async () => {
    await sendSignInOtpEmail(CONFIG, {
      appName: "App",
      email: "bot@example.com",
      otp: "123456",
    });

    expect(sendEmail).toHaveBeenCalledWith({
      from: "App <auth@example.com>",
      to: "bot@example.com",
      subject: "App sign-in code",
      text: "Your App sign-in code is 123456. It expires in 5 minutes.",
    });
  });

  it("throws when Resend reports an error", async () => {
    sendEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "domain not verified" },
    });

    await expect(
      sendSignInOtpEmail(CONFIG, {
        appName: "App",
        email: "bot@example.com",
        otp: "123456",
      }),
    ).rejects.toThrow("domain not verified");
  });
});

describe("createEmailOtpPlugins", () => {
  it("returns the email OTP plugin and the allowlist guard", () => {
    const plugins = createEmailOtpPlugins(CONFIG, "App");

    expect(plugins.map((plugin) => plugin.id)).toEqual([
      "email-otp",
      "email-otp-allowlist",
    ]);
    expect(plugins[0]?.options).toMatchObject({
      otpLength: EMAIL_OTP_LENGTH,
      expiresIn: EMAIL_OTP_EXPIRES_IN_SECONDS,
      allowedAttempts: EMAIL_OTP_ALLOWED_ATTEMPTS,
      disableSignUp: false,
    });
  });

  it("returns the same response for unlisted emails without sending", async () => {
    const auth = buildAuth();

    const listed = await sendCode(auth, "bot@example.com");
    const unlisted = await sendCode(auth, "intruder@example.com");

    expect(unlisted.status).toBe(listed.status);
    expect(await unlisted.json()).toEqual(await listed.json());
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.lastCall?.[0].to).toBe("bot@example.com");
  });

  it("gives a listed email the same response when Resend fails", async () => {
    const auth = buildAuth();
    const listed = await sendCode(auth, "bot@example.com");
    const unlisted = await sendCode(auth, "intruder@example.com");
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    sendEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "domain not verified" },
    });

    const failed = await sendCode(auth, "bot@example.com");

    expect(failed.status).toBe(listed.status);
    expect(await failed.json()).toEqual(await unlisted.json());
    expect(error).toHaveBeenCalledWith(
      "[auth] sign-in code email failed",
      expect.any(Error),
    );
  });

  it("sends nothing for non-sign-in OTP types", async () => {
    const auth = buildAuth();

    for (const type of ["email-verification", "forget-password"]) {
      const response = await sendCode(auth, "bot@example.com", type);
      expect(response.status).toBe(200);
    }
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects sign-in for unlisted emails even with a valid code", async () => {
    const auth = buildAuth();
    // A real code proves the allowlist, not a missing code, rejects the request.
    const api = auth.api as unknown as {
      createVerificationOTP: (input: {
        body: { email: string; type: "sign-in" };
      }) => Promise<string>;
    };
    const otp = await api.createVerificationOTP({
      body: { email: "intruder@example.com", type: "sign-in" },
    });

    const response = await post(auth, "/sign-in/email-otp", {
      email: "intruder@example.com",
      otp,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_OTP" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("stores only a hash of the code", async () => {
    const db = emptyDb();
    const auth = buildAuth(db);

    await sendCode(auth, "bot@example.com");
    const otp = lastSentCode();
    expect(otp).toMatch(/^\d{6}$/);

    expect(db.verification).toHaveLength(1);
    expect(db.verification[0]!.value).not.toContain(otp);
  });

  it("signs in a listed email with the emailed code", async () => {
    const auth = buildAuth();

    await sendCode(auth, "BOT@example.com");
    const otp = lastSentCode();
    expect(otp).toMatch(/^\d{6}$/);

    const response = await post(auth, "/sign-in/email-otp", {
      email: "bot@example.com",
      otp,
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      user: { email: "bot@example.com", emailVerified: true },
    });
    expect(response.headers.get("set-cookie")).toContain("session_token");
  });
});

describe("email OTP hardening", () => {
  it("stores no verification row for an unlisted email", async () => {
    const db = emptyDb();
    const auth = buildAuth(db);

    const response = await sendCode(auth, "intruder@example.com");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(db.verification).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stores no verification row for a non-sign-in type, even for a listed email", async () => {
    const db = emptyDb();
    const auth = buildAuth(db);

    for (const type of ["email-verification", "forget-password"]) {
      const response = await sendCode(auth, "bot@example.com", type);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ success: true });
    }
    expect(db.verification).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("normalizes the email on send and sign-in", async () => {
    const db = emptyDb();
    const auth = buildAuth(db);

    const sent = await sendCode(auth, "  BOT@Example.com ");
    expect(sent.status).toBe(200);
    expect(db.verification).toHaveLength(1);
    expect(sendEmail.mock.lastCall?.[0].to).toBe("bot@example.com");
    const otp = lastSentCode();

    const response = await post(auth, "/sign-in/email-otp", {
      email: " Bot@example.COM ",
      otp,
    });
    expect(response.status).toBe(200);
  });

  it("answers a missing code for a listed and an unlisted email the same way", async () => {
    const auth = buildAuth();

    const listed = await post(auth, "/sign-in/email-otp", {
      email: "bot@example.com",
    });
    const unlisted = await post(auth, "/sign-in/email-otp", {
      email: "intruder@example.com",
    });

    const listedBody = await listed.json();
    expect(listed.status).toBe(400);
    expect(listedBody).toEqual({ code: "INVALID_OTP", message: "Invalid OTP" });
    expect(unlisted.status).toBe(listed.status);
    expect(await unlisted.json()).toEqual(listedBody);
  });

  it("gives direct server calls the same INVALID_OTP error", async () => {
    const auth = buildAuth();
    const api = auth.api as unknown as {
      signInEmailOTP: (input: {
        body: { email: string; otp: string };
      }) => Promise<unknown>;
    };

    await expect(
      api.signInEmailOTP({ body: { email: "bot@example.com", otp: "000000" } }),
    ).rejects.toMatchObject({ body: { code: "INVALID_OTP" }, statusCode: 400 });
  });

  it("maps an expired code to the same INVALID_OTP body as a wrong code", async () => {
    const db = emptyDb();
    const auth = buildAuth(db);
    await sendCode(auth, "bot@example.com");
    const otp = lastSentCode();
    for (const row of db.verification) {
      row.expiresAt = new Date(Date.now() - 1000);
    }

    const expired = await post(auth, "/sign-in/email-otp", {
      email: "bot@example.com",
      otp,
    });
    const wrong = await post(buildAuth(), "/sign-in/email-otp", {
      email: "bot@example.com",
      otp: "000000",
    });

    expect(expired.status).toBe(400);
    expect(await expired.json()).toEqual(await wrong.json());
  });

  it("maps too many attempts to the same INVALID_OTP body as a wrong code", async () => {
    const db = emptyDb();
    const auth = buildAuth(db);
    await sendCode(auth, "bot@example.com");
    const otp = lastSentCode();
    // The stored value is "<hash>:<attempts>", so set the attempt count to the limit.
    for (const row of db.verification) {
      row.value = `${row.value}:${EMAIL_OTP_ALLOWED_ATTEMPTS}`;
    }

    const limited = await post(auth, "/sign-in/email-otp", {
      email: "bot@example.com",
      otp,
    });
    const wrong = await post(buildAuth(), "/sign-in/email-otp", {
      email: "bot@example.com",
      otp: "000000",
    });

    expect(limited.status).toBe(400);
    expect(await limited.json()).toEqual(await wrong.json());
  });
});

describe("email OTP change-email routes", () => {
  it("rejects an unlisted newEmail on request-email-change and change-email", async () => {
    const db = emptyDb();
    const auth = buildAuth(db);

    const request = await post(auth, "/email-otp/request-email-change", {
      newEmail: "intruder@example.com",
    });
    const change = await post(auth, "/email-otp/change-email", {
      newEmail: "intruder@example.com",
      otp: "000000",
    });

    for (const response of [request, change]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        code: "INVALID_OTP",
        message: "Invalid OTP",
      });
    }
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.verification).toHaveLength(0);
  });
});

describe("email OTP failure logging", () => {
  const SECRET = "log-secret-at-least-thirty-two-characters-long";

  function spyAllConsole() {
    return (["log", "info", "warn", "error", "debug"] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
  }

  it("hashes with HMAC when a log secret is given, and plain SHA-256 otherwise", () => {
    const hmacHash = otpEmailLogHash(" BOT@example.com ", SECRET);
    const plainHash = otpEmailLogHash("bot@example.com");

    expect(hmacHash).toMatch(/^[0-9a-f]{16}$/);
    expect(plainHash).toBe(
      createHash("sha256").update("bot@example.com").digest("hex").slice(0, 16),
    );
    expect(hmacHash).not.toBe(plainHash);
    expect(otpEmailLogHash("bot@example.com", SECRET)).toBe(hmacHash);
  });

  it("logOtpFailure writes a reason and hash, never the address", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    logOtpFailure("otp_unlisted", { email: "bot@example.com", logSecret: SECRET });

    expect(warn).toHaveBeenCalledWith("otp_sign_in_failed", {
      reason: "otp_unlisted",
      emailHash: otpEmailLogHash("bot@example.com", SECRET),
      userId: undefined,
    });
  });

  it("logs an unlisted sign-in with the reason and the keyed hash", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const auth = buildAuth(emptyDb(), { logSecret: SECRET });

    await post(auth, "/sign-in/email-otp", {
      email: "intruder@example.com",
      otp: "000000",
    });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("otp_sign_in_failed", {
      reason: "otp_unlisted",
      emailHash: otpEmailLogHash("intruder@example.com", SECRET),
      userId: undefined,
    });
  });

  it("logs a wrong code as otp_invalid", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const auth = buildAuth(emptyDb(), { logSecret: SECRET });

    await sendCode(auth, "bot@example.com");
    await post(auth, "/sign-in/email-otp", {
      email: "bot@example.com",
      otp: "000000",
    });

    expect(warn).toHaveBeenCalledWith(
      "otp_sign_in_failed",
      expect.objectContaining({ reason: "otp_invalid" }),
    );
  });

  it("logs an expired code as otp_expired", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = emptyDb();
    const auth = buildAuth(db, { logSecret: SECRET });
    await sendCode(auth, "bot@example.com");
    const otp = lastSentCode();
    for (const row of db.verification) {
      row.expiresAt = new Date(Date.now() - 1000);
    }

    const response = await post(auth, "/sign-in/email-otp", {
      email: "bot@example.com",
      otp,
    });

    expect(response.status).toBe(400);
    expect(warn).toHaveBeenCalledWith(
      "otp_sign_in_failed",
      expect.objectContaining({ reason: "otp_expired" }),
    );
  });

  it("logs too many attempts as otp_too_many_attempts", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const db = emptyDb();
    const auth = buildAuth(db, { logSecret: SECRET });
    await sendCode(auth, "bot@example.com");
    const otp = lastSentCode();
    for (const row of db.verification) {
      row.value = `${row.value}:${EMAIL_OTP_ALLOWED_ATTEMPTS}`;
    }

    const response = await post(auth, "/sign-in/email-otp", {
      email: "bot@example.com",
      otp,
    });

    expect(response.status).toBe(400);
    expect(warn).toHaveBeenCalledWith(
      "otp_sign_in_failed",
      expect.objectContaining({ reason: "otp_too_many_attempts" }),
    );
  });

  it("never writes the raw email to the console", async () => {
    const spies = spyAllConsole();
    const email = "intruder@example.com";
    const db = emptyDb();
    const auth = buildAuth(db, { logSecret: SECRET });

    await sendCode(auth, email);
    await post(auth, "/sign-in/email-otp", { email, otp: "000000" });
    await sendCode(auth, "bot@example.com");
    const otp = lastSentCode();
    for (const row of db.verification) {
      row.expiresAt = new Date(Date.now() - 1000);
    }
    await post(auth, "/sign-in/email-otp", { email: "bot@example.com", otp });

    sendEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "domain not verified" },
    });
    await sendCode(auth, "bot@example.com");

    const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(logged).toContain("otp_sign_in_failed");
    expect(logged).not.toContain(email);
    expect(logged).not.toContain("bot@example.com");
  });
});
