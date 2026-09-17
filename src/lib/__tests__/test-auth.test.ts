import { vi } from "vitest";

vi.mock("@/lib/auth", () => ({ auth: {} }));
vi.mock("better-auth/crypto", () => ({ makeSignature: vi.fn() }));
vi.mock("prisma/db", () => ({ __esModule: true, default: {} }));

import {
  isTestAuthEnabled,
  isValidTestAuthSecret,
  readBearerToken,
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
    ["the app is running on Vercel", { VERCEL: "1" }],
    ["the deployment is production", { VERCEL_ENV: "production" }],
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

  it("reads only bearer authorization tokens", () => {
    expect(
      readBearerToken(
        new Request("http://localhost", {
          headers: { authorization: "Bearer test-auth-secret" },
        }),
      ),
    ).toBe("test-auth-secret");
    expect(readBearerToken(new Request("http://localhost"))).toBeNull();
  });
});
