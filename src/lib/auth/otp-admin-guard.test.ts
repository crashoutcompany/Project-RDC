// RDC aliases bare "better-auth" to a Vitest mock; /minimal is the real factory.
import { betterAuth } from "better-auth/minimal";
import { memoryAdapter } from "better-auth/adapters/memory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createEmailOtpPlugins, type EmailOtpConfig } from "./email-otp";
import { isAdminAccount, otpAdminGuardPlugin } from "./otp-admin-guard";

type SendResult = {
  data: { id: string } | null;
  error: { message: string } | null;
};

const sendEmail = vi.hoisted(() =>
  vi.fn<(email: unknown) => Promise<SendResult>>(async () => ({
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
const CONFIG: EmailOtpConfig = {
  allowlist: ["bot@example.com", "admin@example.com"],
  from: "App <auth@example.com>",
  resendApiKey: "re_test",
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  role: string | null;
};

type MemoryDb = {
  user: UserRow[];
  session: unknown[];
  account: unknown[];
  verification: Array<{ value: string }>;
};

function userRow(id: string, email: string, role: string | null): UserRow {
  return {
    id,
    name: id,
    email,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    role,
  };
}

function emptyDb(users: UserRow[] = []): MemoryDb {
  return { user: users, session: [], account: [], verification: [] };
}

/** How many user lookups still fail. `Infinity` fails every lookup. */
type LookupFailures = { remaining: number };

/**
 * Mirrors the real RDC wiring: `role` is a declared, server-assigned user field,
 * so Better Auth keeps it when it parses the user it looks up.
 */
function buildAuth(db: MemoryDb, failures: LookupFailures = { remaining: 0 }) {
  const adapter = (
    options: Parameters<ReturnType<typeof memoryAdapter>>[0],
  ) => {
    const inner = memoryAdapter(db)(options);
    return {
      ...inner,
      findOne: async (args: Parameters<typeof inner.findOne>[0]) => {
        if (args.model === "user" && failures.remaining > 0) {
          failures.remaining -= 1;
          throw new Error("db down");
        }
        return inner.findOne(args);
      },
    };
  };

  return betterAuth({
    appName: "App",
    baseURL: ORIGIN,
    secret: SECRET,
    trustedOrigins: [ORIGIN],
    database: adapter as never,
    rateLimit: { enabled: false },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "user",
          input: false,
        },
      },
    },
    plugins: [...createEmailOtpPlugins(CONFIG, "App"), otpAdminGuardPlugin],
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

function sendCode(auth: TestAuth, email: string) {
  return post(auth, "/email-otp/send-verification-otp", {
    email,
    type: "sign-in",
  });
}

function lastSentCode(): string {
  const payload = sendEmail.mock.lastCall?.[0] as { text?: string } | undefined;
  return payload?.text?.match(/\b(\d{6})\b/)?.[1] ?? "";
}

/** Issues a real code for `email` and tries to consume it via sign-in. */
async function signInWithEmailCode(auth: TestAuth, email: string) {
  await sendCode(auth, email);
  const otp = lastSentCode();
  expect(otp).toMatch(/^\d{6}$/);
  return post(auth, "/sign-in/email-otp", { email, otp });
}

/** Mints a sign-in code without the send endpoint, which runs the guard. */
async function mintSignInCode(auth: TestAuth, email: string): Promise<string> {
  const api = auth.api as unknown as {
    createVerificationOTP: (input: {
      body: { email: string; type: "sign-in" };
    }) => Promise<string>;
  };
  return api.createVerificationOTP({ body: { email, type: "sign-in" } });
}

/**
 * Mints a sign-in code without the send endpoint, which now refuses to issue
 * one for blocked accounts. Lets a test prove the verify guard refuses a valid
 * code.
 */
async function signInWithMintedCode(auth: TestAuth, email: string) {
  const otp = await mintSignInCode(auth, email);
  return post(auth, "/sign-in/email-otp", { email, otp });
}

beforeEach(() => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ data: { id: "email-id" }, error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isAdminAccount", () => {
  it("treats only the admin role as admin", () => {
    expect(isAdminAccount({ role: "admin" })).toBe(true);
    expect(isAdminAccount({ role: "user" })).toBe(false);
    expect(isAdminAccount({ role: null })).toBe(false);
    expect(isAdminAccount({})).toBe(false);
    expect(isAdminAccount(null)).toBe(false);
    expect(isAdminAccount(undefined)).toBe(false);
  });
});

describe("otpAdminGuardPlugin", () => {
  it("refuses email-code sign-in into an existing admin account", async () => {
    const db = emptyDb([userRow("admin-1", "admin@example.com", "admin")]);
    const auth = buildAuth(db);

    const response = await signInWithMintedCode(auth, "admin@example.com");

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(db.session).toHaveLength(0);
    expect(db.user).toHaveLength(1);
    expect(db.user[0]).toMatchObject({ id: "admin-1", role: "admin" });
  });

  it("returns the same error as a wrong code on an ordinary account, so existence is not revealed", async () => {
    const db = emptyDb([
      userRow("admin-1", "admin@example.com", "admin"),
      userRow("bot-1", "bot@example.com", "user"),
    ]);
    const auth = buildAuth(db);

    const adminRefusal = await signInWithMintedCode(auth, "admin@example.com");
    const adminBody = await adminRefusal.json();
    const wrongCode = await post(auth, "/sign-in/email-otp", {
      email: "bot@example.com",
      otp: "000000",
    });
    const wrongBody = await wrongCode.json();

    expect(adminRefusal.status).toBe(400);
    expect(wrongCode.status).toBe(adminRefusal.status);
    expect(adminBody).toEqual(wrongBody);
    expect(adminBody).toMatchObject({ code: "INVALID_OTP" });
  });

  it("refuses email-code sign-in into a non-admin account that has a linked OAuth account", async () => {
    const db = emptyDb([userRow("member-1", "bot@example.com", "user")]);
    db.account.push({
      id: "acct-1",
      userId: "member-1",
      accountId: "gh-1",
      providerId: "github",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const auth = buildAuth(db);

    const response = await signInWithMintedCode(auth, "bot@example.com");

    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(db.session).toHaveLength(0);
  });

  it("refuses an admin reset-password, so a code cannot change an admin password", async () => {
    const db = emptyDb([userRow("admin-1", "admin@example.com", "admin")]);
    const auth = buildAuth(db);
    const api = auth.api as unknown as {
      createVerificationOTP: (input: {
        body: { email: string; type: "forget-password" };
      }) => Promise<string>;
    };
    const otp = await api.createVerificationOTP({
      body: { email: "admin@example.com", type: "forget-password" },
    });

    const response = await post(auth, "/email-otp/reset-password", {
      email: "admin@example.com",
      otp,
      password: "a-brand-new-password",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_OTP" });
    expect(db.account).toHaveLength(0);
  });

  it("still lets a regular existing user sign in with a code", async () => {
    const db = emptyDb([userRow("bot-1", "bot@example.com", "user")]);
    const auth = buildAuth(db);

    const response = await signInWithEmailCode(auth, "bot@example.com");

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session_token");
    expect(db.user).toHaveLength(1);
    expect(db.user[0]).toMatchObject({ id: "bot-1", role: "user" });
  });

  it("creates a new plain user for a fresh allowlisted email", async () => {
    const db = emptyDb();
    const auth = buildAuth(db);

    const response = await signInWithEmailCode(auth, "bot@example.com");

    expect(response.status).toBe(200);
    expect(db.user).toHaveLength(1);
    expect(db.user[0]?.email).toBe("bot@example.com");
    expect(db.user[0]?.role).not.toBe("admin");
  });

  it("creates a plain user on first sign-in and keeps it account-free on the second", async () => {
    const db = emptyDb();
    const auth = buildAuth(db);

    const first = await signInWithEmailCode(auth, "bot@example.com");
    const second = await signInWithEmailCode(auth, "bot@example.com");

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.headers.get("set-cookie")).toContain("session_token");
    expect(db.user).toHaveLength(1);
    expect(db.user[0]).toMatchObject({
      email: "bot@example.com",
      role: "user",
    });
    expect(db.account).toHaveLength(0);
  });

  it("answers a blocked send like an unlisted email and sends and stores nothing", async () => {
    const db = emptyDb([
      userRow("admin-1", "admin@example.com", "admin"),
      userRow("member-1", "bot@example.com", "user"),
    ]);
    db.account.push({
      id: "acct-1",
      userId: "member-1",
      accountId: "gh-1",
      providerId: "github",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const auth = buildAuth(db);

    const blockedAdmin = await sendCode(auth, "admin@example.com");
    const blockedMember = await sendCode(auth, "bot@example.com");
    const blockedAdminBody = await blockedAdmin.json();
    const blockedMemberBody = await blockedMember.json();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.verification).toHaveLength(0);

    const unlisted = await sendCode(auth, "intruder@example.com");

    expect(blockedAdmin.status).toBe(unlisted.status);
    expect(blockedMember.status).toBe(unlisted.status);
    expect(blockedAdminBody).toEqual(await unlisted.json());
    expect(blockedMemberBody).toEqual({ success: true });
  });

  it("still sends a code to an allowlisted account with no admin role or linked accounts", async () => {
    const db = emptyDb([userRow("bot-1", "bot@example.com", "user")]);
    const auth = buildAuth(db);

    const response = await sendCode(auth, "bot@example.com");

    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("refuses an admin sent with stray spaces and capitals, so the send matches an unlisted email", async () => {
    const db = emptyDb([userRow("admin-1", "admin@example.com", "admin")]);
    const auth = buildAuth(db);

    const response = await sendCode(auth, "  Admin@Example.com ");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.verification).toHaveLength(0);
  });

  it("lets a non-admin user with no linked accounts sign in after the lookup by userId", async () => {
    const db = emptyDb([userRow("bot-1", "bot@example.com", "user")]);
    const auth = buildAuth(db);

    const response = await signInWithEmailCode(auth, "bot@example.com");

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session_token");
  });

  it("refuses an admin when the lookup succeeds on the retry", async () => {
    const db = emptyDb([userRow("admin-1", "admin@example.com", "admin")]);
    const failures: LookupFailures = { remaining: 0 };
    const auth = buildAuth(db, failures);
    const otp = await mintSignInCode(auth, "admin@example.com");

    failures.remaining = 1;
    const response = await post(auth, "/sign-in/email-otp", {
      email: "admin@example.com",
      otp,
    });

    expect(failures.remaining).toBe(0);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_OTP" });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("succeeds when the lookup fails once and succeeds on the retry", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const db = emptyDb([userRow("bot-1", "bot@example.com", "user")]);
    const failures: LookupFailures = { remaining: 1 };
    const auth = buildAuth(db, failures);

    const sent = await sendCode(auth, "bot@example.com");
    const otp = lastSentCode();
    const response = await post(auth, "/sign-in/email-otp", {
      email: "bot@example.com",
      otp,
    });

    expect(sent.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("session_token");
    expect(error).not.toHaveBeenCalled();
  });

  it("denies sign-in and logs without the email when the lookup fails twice", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const db = emptyDb([userRow("bot-1", "bot@example.com", "user")]);
    const failures: LookupFailures = { remaining: 0 };
    const auth = buildAuth(db, failures);
    const otp = await mintSignInCode(auth, "bot@example.com");

    failures.remaining = Infinity;
    const response = await post(auth, "/sign-in/email-otp", {
      email: "bot@example.com",
      otp,
    });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(db.session).toHaveLength(0);
    expect(error).toHaveBeenCalledWith("otp_guard_lookup_failed", {
      attempts: 2,
      error: expect.any(Error),
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("bot@example.com");
  });

  it("denies a code send and logs without the email when the lookup fails twice", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const db = emptyDb([userRow("bot-1", "bot@example.com", "user")]);
    const failures: LookupFailures = { remaining: Infinity };
    const auth = buildAuth(db, failures);

    const response = await sendCode(auth, "bot@example.com");

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.verification).toHaveLength(0);
    expect(error).toHaveBeenCalledWith("otp_guard_lookup_failed", {
      attempts: 2,
      error: expect.any(Error),
    });
    expect(JSON.stringify(error.mock.calls)).not.toContain("bot@example.com");
  });
});
