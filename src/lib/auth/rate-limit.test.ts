import { betterAuth } from "better-auth/minimal";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP } from "better-auth/plugins/email-otp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => {
  type Entry = { value: number; ttl: number };
  const state = {
    keys: new Map<string, Entry>(),
    constructed: [] as Array<{ url: string; token: string }>,
    mode: "ok" as "ok" | "error" | "hang",
  };

  class Redis {
    constructor(config: { url: string; token: string }) {
      state.constructed.push(config);
    }

    pipeline() {
      const ops: Array<() => unknown> = [];
      const chain = {
        set(
          key: string,
          value: number,
          options: { nx?: boolean; ex?: number },
        ) {
          ops.push(() => {
            if (!state.keys.has(key)) {
              state.keys.set(key, { value, ttl: options.ex ?? -1 });
            }
            return "OK";
          });
          return chain;
        },
        incr(key: string) {
          ops.push(() => {
            const entry = state.keys.get(key);
            if (!entry) throw new Error("missing key");
            entry.value += 1;
            return entry.value;
          });
          return chain;
        },
        ttl(key: string) {
          ops.push(() => state.keys.get(key)?.ttl ?? -2);
          return chain;
        },
        async exec() {
          if (state.mode === "error") throw new Error("redis is down");
          if (state.mode === "hang") return new Promise<never>(() => {});
          return ops.map((op) => op());
        },
      };
      return chain;
    }
  }

  return { state, Redis };
});

vi.mock("@upstash/redis", () => ({ Redis: redis.Redis }));

import {
  createAuthRateLimitStore,
  createMemoryRateLimitStore,
  createOtpEmailLockoutPlugin,
  isSharedRateLimitKey,
  OTP_SEND_LOCKOUT,
  OTP_SIGN_IN_LOCKOUT,
  rateLimitPrefixFromAppName,
  REDIS_TIMEOUT_MS,
} from "./rate-limit";

const ORIGIN = "http://localhost:3000";
const SECRET = "test-better-auth-secret-at-least-32-characters";
const UPSTASH_ENV = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token-value",
};
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const OTP_TABLES = { user: [], session: [], account: [], verification: [] };

beforeEach(() => {
  redis.state.keys.clear();
  redis.state.constructed.length = 0;
  redis.state.mode = "ok";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createAuthRateLimitStore", () => {
  it("uses Redis when both Upstash variables are set, under the env prefix", async () => {
    const store = createAuthRateLimitStore({
      env: { ...UPSTASH_ENV, AUTH_RATE_LIMIT_PREFIX: "shared-app" },
      defaultPrefix: "project-z",
    });

    const decision = await store.consume("1.2.3.4|/sign-in/email-otp", {
      window: 60,
      max: 3,
    });

    expect(decision).toEqual({ allowed: true, retryAfter: null });
    expect(redis.state.constructed).toEqual([
      { url: UPSTASH_ENV.UPSTASH_REDIS_REST_URL, token: UPSTASH_ENV.UPSTASH_REDIS_REST_TOKEN },
    ]);
    const keys = [...redis.state.keys.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^shared-app:auth-rl:[0-9a-f]{64}$/);
    expect(redis.state.keys.get(keys[0]!)?.ttl).toBe(60);
  });

  it("falls back to the app-name prefix when AUTH_RATE_LIMIT_PREFIX is unset", async () => {
    const store = createAuthRateLimitStore({
      env: UPSTASH_ENV,
      defaultPrefix: rateLimitPrefixFromAppName("Project Z"),
    });

    await store.consume("ip|/sign-in/email-otp", { window: 60, max: 3 });

    expect([...redis.state.keys.keys()][0]).toMatch(/^project-z:auth-rl:/);
  });

  it("stores no raw email or IP in Redis keys", async () => {
    const store = createAuthRateLimitStore({
      env: UPSTASH_ENV,
      defaultPrefix: "project-z",
    });

    await store.consume(`otp-send:${normalizeEmail("Bot@Example.com")}`, OTP_SEND_LOCKOUT);
    await store.consume("203.0.113.9|/sign-in/email-otp", { window: 60, max: 3 });

    const keys = [...redis.state.keys.keys()].join("\n");
    expect(keys).not.toContain("bot@example.com");
    expect(keys).not.toContain("bot%40example.com");
    expect(keys).not.toContain("203.0.113.9");
  });

  it("keeps non-auth paths in memory even when Redis is configured", async () => {
    const store = createAuthRateLimitStore({
      env: UPSTASH_ENV,
      defaultPrefix: "project-z",
    });

    const results = [];
    for (let i = 0; i < 3; i += 1) {
      results.push(await store.consume("ip|/get-session", { window: 60, max: 2 }));
    }

    expect(redis.state.keys.size).toBe(0);
    expect(results.map((r) => r.allowed)).toEqual([true, true, false]);
  });

  it("sends sign-in, sign-up, email OTP and lockout keys to Redis only", () => {
    expect(isSharedRateLimitKey("ip|/sign-in/email-otp")).toBe(true);
    expect(isSharedRateLimitKey("ip|/sign-in/social")).toBe(true);
    expect(isSharedRateLimitKey("ip|/sign-up/email")).toBe(true);
    expect(isSharedRateLimitKey("ip|/email-otp/send-verification-otp")).toBe(true);
    expect(isSharedRateLimitKey("otp-send:bot@example.com")).toBe(true);
    expect(isSharedRateLimitKey("otp-sign-in:bot@example.com")).toBe(true);
    expect(isSharedRateLimitKey("ip|/get-session")).toBe(false);
    expect(isSharedRateLimitKey("ip|/list-accounts")).toBe(false);
  });

  it("uses memory only, without calling Redis, when the env is not set", async () => {
    const store = createAuthRateLimitStore({ env: {}, defaultPrefix: "project-z" });

    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await store.consume("ip|/x", { window: 60, max: 3 }));
    }

    expect(redis.state.constructed).toHaveLength(0);
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false]);
  });

  it("uses memory only when just one Upstash variable is set, and warns", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createAuthRateLimitStore({
      env: { UPSTASH_REDIS_REST_URL: "https://example.upstash.io" },
      defaultPrefix: "project-z",
    });

    expect(redis.state.constructed).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("UPSTASH_REDIS_REST_TOKEN"),
    );
  });

  it("falls back to memory on a Redis error and logs once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    redis.state.mode = "error";
    const store = createAuthRateLimitStore({
      env: UPSTASH_ENV,
      defaultPrefix: "project-z",
    });
    const rule = { window: 60, max: 2 };

    const results = [];
    for (let i = 0; i < 3; i += 1) {
      results.push(await store.consume("ip|/sign-in/email-otp", rule));
    }

    expect(results.map((r) => r.allowed)).toEqual([true, true, false]);
    const unavailable = warn.mock.calls.filter(
      ([message]) => message === "auth_rate_limit_redis_unavailable",
    );
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]?.[1]).toEqual({ reason: "error", errorName: "Error" });
  });

  it("falls back to memory when Redis does not answer in time", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    redis.state.mode = "hang";
    const store = createAuthRateLimitStore({
      env: UPSTASH_ENV,
      defaultPrefix: "project-z",
    });

    const started = Date.now();
    const decision = await store.consume("ip|/email-otp/send-verification-otp", {
      window: 60,
      max: 3,
    });

    expect(decision).toEqual({ allowed: true, retryAfter: null });
    expect(Date.now() - started).toBeGreaterThanOrEqual(REDIS_TIMEOUT_MS - 50);
    expect(warn).toHaveBeenCalledWith("auth_rate_limit_redis_unavailable", {
      reason: "timeout",
      errorName: "RedisTimeoutError",
    });
  }, 10_000);
});

describe("createMemoryRateLimitStore", () => {
  it("allows max requests per window, then reports retryAfter", async () => {
    let now = 1_000_000;
    const store = createMemoryRateLimitStore(() => now);
    const rule = { window: 60, max: 2 };

    expect(await store.consume("k", rule)).toEqual({ allowed: true, retryAfter: null });
    expect(await store.consume("k", rule)).toEqual({ allowed: true, retryAfter: null });
    expect(await store.consume("k", rule)).toEqual({ allowed: false, retryAfter: 60 });

    now += 61_000;
    expect(await store.consume("k", rule)).toEqual({ allowed: true, retryAfter: null });
  });
});

describe("createOtpEmailLockoutPlugin", () => {
  function buildAuth(sendVerificationOTP = vi.fn(async () => undefined)) {
    const store = createMemoryRateLimitStore();
    const auth = betterAuth({
      secret: SECRET,
      baseURL: ORIGIN,
      database: memoryAdapter(OTP_TABLES),
      rateLimit: { enabled: false },
      plugins: [
        createOtpEmailLockoutPlugin({ store, normalizeEmail }),
        emailOTP({ sendVerificationOTP }),
      ],
    });
    return { auth, sendVerificationOTP };
  }

  function post(auth: ReturnType<typeof buildAuth>["auth"], path: string, body: object) {
    return auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN },
        body: JSON.stringify(body),
      }),
    );
  }

  it("returns the success body without sending once the send limit is reached", async () => {
    const { auth, sendVerificationOTP } = buildAuth();
    const email = "bot@example.com";

    for (let i = 0; i < OTP_SEND_LOCKOUT.max; i += 1) {
      const response = await post(auth, "/email-otp/send-verification-otp", {
        email,
        type: "sign-in",
      });
      expect(response.status).toBe(200);
    }
    await vi.waitFor(() =>
      expect(sendVerificationOTP).toHaveBeenCalledTimes(OTP_SEND_LOCKOUT.max),
    );

    const locked = await post(auth, "/email-otp/send-verification-otp", {
      email,
      type: "sign-in",
    });
    expect(locked.status).toBe(200);
    expect(await locked.json()).toEqual({ success: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sendVerificationOTP).toHaveBeenCalledTimes(OTP_SEND_LOCKOUT.max);
  });

  it("returns 429 TOO_MANY_REQUESTS on sign-in once the attempt limit is reached", async () => {
    const { auth } = buildAuth();
    const email = "bot@example.com";

    for (let i = 0; i < OTP_SIGN_IN_LOCKOUT.max; i += 1) {
      const response = await post(auth, "/sign-in/email-otp", {
        email,
        otp: "000000",
      });
      expect(response.status).not.toBe(429);
    }

    const locked = await post(auth, "/sign-in/email-otp", {
      email,
      otp: "000000",
    });
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("counts emails by their normalized form", async () => {
    const { auth, sendVerificationOTP } = buildAuth();

    for (let i = 0; i < OTP_SEND_LOCKOUT.max; i += 1) {
      // The endpoint validates the address before the send, so only case varies here.
      const email = i % 2 === 0 ? "Bot@Example.com" : "bot@example.COM";
      await post(auth, "/email-otp/send-verification-otp", { email, type: "sign-in" });
    }
    await vi.waitFor(() =>
      expect(sendVerificationOTP).toHaveBeenCalledTimes(OTP_SEND_LOCKOUT.max),
    );

    await post(auth, "/email-otp/send-verification-otp", {
      email: "BOT@example.com",
      type: "sign-in",
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sendVerificationOTP).toHaveBeenCalledTimes(OTP_SEND_LOCKOUT.max);
  });
});
