import { vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("better-auth/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("better-auth/crypto")>();
  return { ...actual, makeSignature: vi.fn() };
});
vi.mock("prisma/db", () => ({ __esModule: true, default: {} }));

import {
  evaluateTestAuthRequest,
  isTestAuthEnabled,
  isValidTestAuthSecret,
  TEST_AUTH_HEADER,
} from "@/lib/test-auth";

describe("test auth guards", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.VERCEL;
    delete process.env.VERCEL_ENV;
    process.env.EXPOSE_TESTING_API = "1";
    process.env.TEST_AUTH_SECRET = "test-auth-secret";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("is enabled for an explicitly exposed local build", () => {
    expect(isTestAuthEnabled()).toBe(true);
  });

  it.each([
    ["the expose flag is absent", { EXPOSE_TESTING_API: undefined }],
    ["the app is running on Vercel without a preview env", { VERCEL: "1" }],
    ["the deployment is production", { VERCEL_ENV: "production" }],
    [
      "Vercel preview is set without EXPOSE_TESTING_API",
      { VERCEL: "1", VERCEL_ENV: "preview", EXPOSE_TESTING_API: undefined },
    ],
  ])("is disabled when %s", (_label, overrides) => {
    Object.assign(process.env, overrides);
    expect(isTestAuthEnabled()).toBe(false);
  });

  it("requires the exact configured secret", () => {
    expect(isValidTestAuthSecret("test-auth-secret")).toBe(true);
    expect(isValidTestAuthSecret("wrong-secret")).toBe(false);
    expect(isValidTestAuthSecret(null)).toBe(false);
  });

  it("rejects every value when TEST_AUTH_SECRET is missing", () => {
    delete process.env.TEST_AUTH_SECRET;
    expect(isValidTestAuthSecret("")).toBe(false);
  });

  it("allows a matching x-test-auth-secret header", () => {
    expect(evaluateTestAuthRequest("test-auth-secret")).toEqual({
      allow: true,
    });
    expect(evaluateTestAuthRequest("wrong-secret")).toEqual({
      allow: false,
      status: 401,
    });
    expect(TEST_AUTH_HEADER).toBe("x-test-auth-secret");
  });
});
