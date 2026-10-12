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

/**
 * Mirrors the real RDC wiring: `role` is a declared, server-assigned user field,
 * so Better Auth keeps it when it parses the user it looks up.
 */
function buildAuth(
  db: MemoryDb,
  { failUserLookup = false }: { failUserLookup?: boolean } = {},
) {
  const adapter = (
    options: Parameters<ReturnType<typeof memoryAdapter>>[0],
  ) => {
    const inner = memoryAdapter(db)(options);
    if (!failUserLookup) return inner;
    return {
      ...inner,
      findOne: async (args: Parameters<typeof inner.findOne>[0]) => {
        if (args.model === "user") throw new Error("db down");
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

    const response = await signInWithEmailCode(auth, "admin@example.com");

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

    const adminRefusal = await signInWithEmailCode(auth, "admin@example.com");
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

    const response = await signInWithEmailCode(auth, "bot@example.com");

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

  it("fails closed when the user lookup fails", async () => {
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const db = emptyDb([userRow("bot-1", "bot@example.com", "user")]);
    const auth = buildAuth(db, { failUserLookup: true });

    await sendCode(auth, "bot@example.com");
    const otp = lastSentCode();
    const response = await post(auth, "/sign-in/email-otp", {
      email: "bot@example.com",
      otp,
    });

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(db.session).toHaveLength(0);
    error.mockRestore();
  });
});
