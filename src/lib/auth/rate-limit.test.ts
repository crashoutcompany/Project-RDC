import { createHmac } from "node:crypto";

// RDC aliases bare "better-auth" to a Vitest mock; /minimal is the real factory.
import { betterAuth } from "better-auth/minimal";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP } from "better-auth/plugins/email-otp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => {
  type Entry = { value: number; ttl: number };
  type Config = { url: string; token: string; retry?: unknown };
  const state = {
    keys: new Map<string, Entry>(),
    constructed: [] as Config[],
    mode: "ok" as "ok" | "error" | "hang",
  };

  // JS mirror of CONSUME_SCRIPT in rate-limit.ts. INCR creates a missing key
  // (value 0, no TTL) and then increments it. The expiry is set when the key
  // was just created or has no TTL (-1). ttl is in seconds, -1 means none.
  function runConsumeScript(key: string, window: number): [number, number] {
    let entry = state.keys.get(key);
    if (!entry) {
      entry = { value: 0, ttl: -1 };
      state.keys.set(key, entry);
    }
    entry.value += 1;
    const count = entry.value;
    let ttl = entry.ttl;
    if (count === 1 || ttl === -1) {
      entry.ttl = window;
      ttl = window;
    }
    return [count, ttl];
  }

  class Redis {
    constructor(config: Config) {
      state.constructed.push(config);
    }

    async eval(script: string, keys: string[], args: string[]) {
      if (state.mode === "error") throw new Error("redis is down");
      if (state.mode === "hang") return new Promise<never>(() => {});
      if (!script.includes("INCR") || !script.includes("EXPIRE")) {
        throw new Error("unexpected script");
      }
      return runConsumeScript(keys[0]!, Number(args[0]));
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
  OTP_SEND_EMAIL_IP_LOCKOUT,
  OTP_SEND_EMAIL_LOCKOUT,
  OTP_SIGN_IN_EMAIL_IP_LOCKOUT,
  OTP_SIGN_IN_EMAIL_LOCKOUT,
  rateLimitPrefixFromAppName,
  REDIS_TIMEOUT_MS,
  resolveRateLimitPrefix,
} from "./rate-limit";

const ORIGIN = "http://localhost:3000";
const SECRET = "test-better-auth-secret-at-least-32-characters";
const OTHER_SECRET = "another-secret-that-is-also-long-enough-to-use";
const UPSTASH_ENV = {
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "token-value",
};
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const OTP_TABLES = { user: [], session: [], account: [], verification: [] };

/** The storage key for a logical key, as the store writes it under `prefix`. */
function storageKeyFor(prefix: string, logicalKey: string, secret = SECRET) {
  const digest = createHmac("sha256", secret).update(logicalKey).digest("hex");
  return `${prefix}:auth-rl:${digest}`;
}

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
      appSlug: "project-z",
      secret: SECRET,
    });

    const decision = await store.consume("1.2.3.4|/sign-in/email-otp", {
      window: 60,
      max: 3,
    });

    expect(decision).toEqual({ allowed: true, retryAfter: null });
    expect(redis.state.constructed).toEqual([
      {
        url: UPSTASH_ENV.UPSTASH_REDIS_REST_URL,
        token: UPSTASH_ENV.UPSTASH_REDIS_REST_TOKEN,
        retry: { retries: 0 },
      },
    ]);
    const keys = [...redis.state.keys.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^shared-app:auth-rl:[0-9a-f]{64}$/);
    expect(redis.state.keys.get(keys[0]!)?.ttl).toBe(60);
  });

  it("creates a missing key with its expiry in one step (INCR on a missing key does not throw)", async () => {
    const store = createAuthRateLimitStore({
      env: { ...UPSTASH_ENV, AUTH_RATE_LIMIT_PREFIX: "shared-app" },
      appSlug: "project-z",
      secret: SECRET,
    });
    const key = storageKeyFor("shared-app", "1.2.3.4|/sign-in/email-otp");

    const decision = await store.consume("1.2.3.4|/sign-in/email-otp", {
      window: 60,
      max: 3,
    });

    expect(decision.allowed).toBe(true);
    expect(redis.state.keys.get(key)).toEqual({ value: 1, ttl: 60 });
  });

  it("restores an expiry on an existing key that has none (TTL -1), and keeps the count", async () => {
    const store = createAuthRateLimitStore({
      env: { ...UPSTASH_ENV, AUTH_RATE_LIMIT_PREFIX: "shared-app" },
      appSlug: "project-z",
      secret: SECRET,
    });
    const logical = "otp-send:bot@example.com|203.0.113.7";
    const key = storageKeyFor("shared-app", logical);
    // A key left behind by an earlier version, with no expiry (permanent lockout).
    redis.state.keys.set(key, { value: 3, ttl: -1 });

    const decision = await store.consume(logical, OTP_SEND_EMAIL_IP_LOCKOUT);

    expect(decision.allowed).toBe(true);
    expect(redis.state.keys.get(key)).toEqual({
      value: 4,
      ttl: OTP_SEND_EMAIL_IP_LOCKOUT.window,
    });
  });

  it("does not extend the expiry of a key that already has one", async () => {
    const store = createAuthRateLimitStore({
      env: { ...UPSTASH_ENV, AUTH_RATE_LIMIT_PREFIX: "shared-app" },
      appSlug: "project-z",
      secret: SECRET,
    });
    const logical = "1.2.3.4|/sign-in/email-otp";
    const key = storageKeyFor("shared-app", logical);
    redis.state.keys.set(key, { value: 1, ttl: 30 });

    await store.consume(logical, { window: 60, max: 3 });

    expect(redis.state.keys.get(key)).toEqual({ value: 2, ttl: 30 });
  });

  it("reports the Redis TTL as retryAfter once the limit is reached", async () => {
    const store = createAuthRateLimitStore({
      env: { ...UPSTASH_ENV, AUTH_RATE_LIMIT_PREFIX: "shared-app" },
      appSlug: "project-z",
      secret: SECRET,
    });
    const rule = { window: 60, max: 1 };

    expect(await store.consume("1.2.3.4|/sign-in/email-otp", rule)).toEqual({
      allowed: true,
      retryAfter: null,
    });
    expect(await store.consume("1.2.3.4|/sign-in/email-otp", rule)).toEqual({
      allowed: false,
      retryAfter: 60,
    });
  });

  it("passes retries: 0 to the Redis client so a timed-out call is not retried", () => {
    createAuthRateLimitStore({
      env: UPSTASH_ENV,
      appSlug: "project-z",
      secret: SECRET,
    });

    expect(redis.state.constructed[0]?.retry).toEqual({ retries: 0 });
  });

  it("falls back to the KV_REST_API_* names when the UPSTASH_* pair is unset", async () => {
    const store = createAuthRateLimitStore({
      env: {
        KV_REST_API_URL: "https://kv.upstash.io",
        KV_REST_API_TOKEN: "kv-token",
        AUTH_RATE_LIMIT_PREFIX: "shared-app",
      },
      appSlug: "project-z",
      secret: SECRET,
    });

    await store.consume("1.2.3.4|/sign-in/email-otp", { window: 60, max: 3 });

    expect(redis.state.constructed).toEqual([
      { url: "https://kv.upstash.io", token: "kv-token", retry: { retries: 0 } },
    ]);
    expect(redis.state.keys.size).toBe(1);
  });

  it("prefers the UPSTASH_* pair over the KV_REST_API_* pair", () => {
    createAuthRateLimitStore({
      env: {
        ...UPSTASH_ENV,
        KV_REST_API_URL: "https://kv.upstash.io",
        KV_REST_API_TOKEN: "kv-token",
      },
      appSlug: "project-z",
      secret: SECRET,
    });

    expect(redis.state.constructed[0]).toMatchObject({
      url: UPSTASH_ENV.UPSTASH_REDIS_REST_URL,
      token: UPSTASH_ENV.UPSTASH_REDIS_REST_TOKEN,
    });
  });

  it("does not mix halves of the two pairs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createAuthRateLimitStore({
      env: {
        UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
        KV_REST_API_TOKEN: "kv-token",
      },
      appSlug: "project-z",
      secret: SECRET,
    });

    expect(redis.state.constructed).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("KV_REST_API_URL"));
  });

  it("uses <app slug>:<VERCEL_ENV> as the default prefix on Vercel", async () => {
    const store = createAuthRateLimitStore({
      env: { ...UPSTASH_ENV, VERCEL_ENV: "preview", NODE_ENV: "production" },
      appSlug: rateLimitPrefixFromAppName("Pocket Trading"),
      secret: SECRET,
    });

    await store.consume("1.2.3.4|/sign-in/email-otp", { window: 60, max: 3 });

    expect([...redis.state.keys.keys()][0]).toMatch(
      /^pocket-trading:preview:auth-rl:[0-9a-f]{64}$/,
    );
  });

  it("falls back to NODE_ENV, then development, for the default prefix", () => {
    expect(resolveRateLimitPrefix({ NODE_ENV: "production" }, "pocket-trading")).toBe(
      "pocket-trading:production",
    );
    expect(resolveRateLimitPrefix({}, "pocket-trading")).toBe(
      "pocket-trading:development",
    );
  });

  it("uses AUTH_RATE_LIMIT_PREFIX as the whole prefix when it is set", () => {
    expect(
      resolveRateLimitPrefix(
        { VERCEL_ENV: "production", AUTH_RATE_LIMIT_PREFIX: "shared" },
        "pocket-trading",
      ),
    ).toBe("shared");
  });

  it("separates the same logical key by secret (HMAC keys differ)", async () => {
    const env = { ...UPSTASH_ENV, AUTH_RATE_LIMIT_PREFIX: "shared-app" };
    const logical = "otp-send:bot@example.com|203.0.113.9";
    const first = createAuthRateLimitStore({ env, appSlug: "x", secret: SECRET });
    const second = createAuthRateLimitStore({
      env,
      appSlug: "x",
      secret: OTHER_SECRET,
    });

    await first.consume(logical, OTP_SEND_EMAIL_IP_LOCKOUT);
    await second.consume(logical, OTP_SEND_EMAIL_IP_LOCKOUT);

    expect(redis.state.keys.size).toBe(2);
    expect(storageKeyFor("shared-app", logical, SECRET)).not.toBe(
      storageKeyFor("shared-app", logical, OTHER_SECRET),
    );
    expect(redis.state.keys.has(storageKeyFor("shared-app", logical, SECRET))).toBe(
      true,
    );
    expect(redis.state.keys.has(storageKeyFor("shared-app", logical, OTHER_SECRET))).toBe(
      true,
    );
  });

  it("stores no raw email or IP in Redis keys", async () => {
    const store = createAuthRateLimitStore({
      env: UPSTASH_ENV,
      appSlug: "project-z",
      secret: SECRET,
    });

    await store.consume(`otp-send:${normalizeEmail("Bot@Example.com")}|203.0.113.9`, OTP_SEND_EMAIL_IP_LOCKOUT);
    await store.consume(`otp-send-email:${normalizeEmail("Bot@Example.com")}`, OTP_SEND_EMAIL_LOCKOUT);
    await store.consume("203.0.113.9|/sign-in/email-otp", { window: 60, max: 3 });

    const keys = [...redis.state.keys.keys()].join("\n");
    expect(keys).not.toContain("bot@example.com");
    expect(keys).not.toContain("bot%40example.com");
    expect(keys).not.toContain("203.0.113.9");
    expect(keys).not.toContain("Bot@Example.com");
  });

  it("keeps non-auth paths in memory even when Redis is configured", async () => {
    const store = createAuthRateLimitStore({
      env: UPSTASH_ENV,
      appSlug: "project-z",
      secret: SECRET,
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
    expect(isSharedRateLimitKey("otp-send:bot@example.com|1.2.3.4")).toBe(true);
    expect(isSharedRateLimitKey("otp-send-email:bot@example.com")).toBe(true);
    expect(isSharedRateLimitKey("otp-sign-in:bot@example.com|1.2.3.4")).toBe(true);
    expect(isSharedRateLimitKey("otp-sign-in-email:bot@example.com")).toBe(true);
    expect(isSharedRateLimitKey("ip|/get-session")).toBe(false);
    expect(isSharedRateLimitKey("ip|/list-accounts")).toBe(false);
  });

  it("uses memory only, without calling Redis, when the env is not set", async () => {
    const store = createAuthRateLimitStore({
      env: {},
      appSlug: "project-z",
      secret: SECRET,
    });

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
      appSlug: "project-z",
      secret: SECRET,
    });

    expect(redis.state.constructed).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("UPSTASH_REDIS_REST_TOKEN"),
    );
  });

  it("uses memory only when the URL is a vercel pull placeholder, and warns", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    createAuthRateLimitStore({
      env: {
        UPSTASH_REDIS_REST_URL: "[SENSITIVE]",
        UPSTASH_REDIS_REST_TOKEN: "[SENSITIVE]",
      },
      appSlug: "project-z",
      secret: SECRET,
    });

    expect(redis.state.constructed).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("UPSTASH_REDIS_REST_URL"),
    );
  });

  it("falls back to memory on a Redis error and logs once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    redis.state.mode = "error";
    const store = createAuthRateLimitStore({
      env: UPSTASH_ENV,
      appSlug: "project-z",
      secret: SECRET,
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
      appSlug: "project-z",
      secret: SECRET,
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
    const store = createMemoryRateLimitStore({ secret: SECRET, now: () => now });
    const rule = { window: 60, max: 2 };

    expect(await store.consume("k", rule)).toEqual({ allowed: true, retryAfter: null });
    expect(await store.consume("k", rule)).toEqual({ allowed: true, retryAfter: null });
    expect(await store.consume("k", rule)).toEqual({ allowed: false, retryAfter: 60 });

    now += 61_000;
    expect(await store.consume("k", rule)).toEqual({ allowed: true, retryAfter: null });
  });

  it("requires a secret", () => {
    expect(() => createMemoryRateLimitStore({ secret: "" })).toThrow();
  });
});

describe("createOtpEmailLockoutPlugin", () => {
  function buildAuth(
    sendVerificationOTP = vi.fn(async () => undefined),
    advanced: Record<string, unknown> = {},
  ) {
    const store = createMemoryRateLimitStore({ secret: SECRET });
    const auth = betterAuth({
      secret: SECRET,
      baseURL: ORIGIN,
      database: memoryAdapter(OTP_TABLES),
      rateLimit: { enabled: false },
      advanced,
      plugins: [
        createOtpEmailLockoutPlugin({ store, normalizeEmail }),
        emailOTP({ sendVerificationOTP }),
      ],
    });
    return { auth, sendVerificationOTP };
  }

  function post(
    auth: ReturnType<typeof buildAuth>["auth"],
    path: string,
    body: object,
    ip?: string,
    { origin = ORIGIN, extra = {} }: { origin?: string | null; extra?: Record<string, string> } = {},
  ) {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      ...extra,
    };
    if (origin !== null) headers.origin = origin;
    if (ip !== undefined) headers["x-forwarded-for"] = ip;
    return auth.handler(
      new Request(`${ORIGIN}/api/auth${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
  }

  const sendBody = (email: string) => ({ email, type: "sign-in" });
  const signInBody = (email: string) => ({ email, otp: "000000" });

  it("returns the success body without sending once the email+IP send limit is reached", async () => {
    const { auth, sendVerificationOTP } = buildAuth();
    const email = "bot@example.com";

    for (let i = 0; i < OTP_SEND_EMAIL_IP_LOCKOUT.max; i += 1) {
      const response = await post(auth, "/email-otp/send-verification-otp", sendBody(email), "198.51.100.1");
      expect(response.status).toBe(200);
    }
    await vi.waitFor(() =>
      expect(sendVerificationOTP).toHaveBeenCalledTimes(OTP_SEND_EMAIL_IP_LOCKOUT.max),
    );

    const locked = await post(auth, "/email-otp/send-verification-otp", sendBody(email), "198.51.100.1");
    expect(locked.status).toBe(200);
    expect(await locked.json()).toEqual({ success: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sendVerificationOTP).toHaveBeenCalledTimes(OTP_SEND_EMAIL_IP_LOCKOUT.max);
  });

  it("still sends from another IP while the email+IP pair is locked (looser email-only cap applies)", async () => {
    const { auth, sendVerificationOTP } = buildAuth();
    const email = "bot@example.com";

    for (let i = 0; i < OTP_SEND_EMAIL_IP_LOCKOUT.max + 1; i += 1) {
      await post(auth, "/email-otp/send-verification-otp", sendBody(email), "198.51.100.1");
    }
    await post(auth, "/email-otp/send-verification-otp", sendBody(email), "198.51.100.2");

    await vi.waitFor(() =>
      expect(sendVerificationOTP).toHaveBeenCalledTimes(OTP_SEND_EMAIL_IP_LOCKOUT.max + 1),
    );
  });

  it("counts denied requests against the email-only send cap", async () => {
    const { auth, sendVerificationOTP } = buildAuth();
    const email = "bot@example.com";
    const perIp = OTP_SEND_EMAIL_IP_LOCKOUT.max;

    // 5 sends from IP 1 use up the pair; 10 more from IP 1 are denied but
    // still count toward the email-only cap (5 + 10 = 15).
    for (let i = 0; i < perIp + 10; i += 1) {
      await post(auth, "/email-otp/send-verification-otp", sendBody(email), "198.51.100.1");
    }
    // 5 more from IP 2 bring the email-only count to 20. All are sent.
    for (let i = 0; i < OTP_SEND_EMAIL_LOCKOUT.max - perIp - 10; i += 1) {
      await post(auth, "/email-otp/send-verification-otp", sendBody(email), "198.51.100.2");
    }
    // Only the allowed requests send: 5 from IP 1 and 5 from IP 2.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sendVerificationOTP).toHaveBeenCalledTimes(perIp + 5);

    // One more from a fresh IP is over the email-only cap (count 21).
    // Had the denied requests not counted, this one would send.
    const locked = await post(auth, "/email-otp/send-verification-otp", sendBody(email), "198.51.100.3");
    expect(locked.status).toBe(200);
    expect(await locked.json()).toEqual({ success: true });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sendVerificationOTP).toHaveBeenCalledTimes(perIp + 5);
  });

  it("returns 429 TOO_MANY_REQUESTS with Retry-After on sign-in once the email+IP limit is reached", async () => {
    const { auth } = buildAuth();
    const email = "bot@example.com";
    const ip = "198.51.100.1";

    for (let i = 0; i < OTP_SIGN_IN_EMAIL_IP_LOCKOUT.max; i += 1) {
      const response = await post(auth, "/sign-in/email-otp", signInBody(email), ip);
      expect(response.status).not.toBe(429);
    }

    const locked = await post(auth, "/sign-in/email-otp", signInBody(email), ip);
    expect(locked.status).toBe(429);
    expect(await locked.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" });
    const retryAfter = Number(locked.headers.get("retry-after"));
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(OTP_SIGN_IN_EMAIL_IP_LOCKOUT.window);
  });

  it("runs the CSRF check before answering a locked sign-in with 429", async () => {
    // Tests turn the origin check off by default; re-enable it so formCsrfMiddleware runs.
    const { auth } = buildAuth(undefined, { disableOriginCheck: false });
    const email = "bot@example.com";
    const ip = "198.51.100.1";

    for (let i = 0; i < OTP_SIGN_IN_EMAIL_IP_LOCKOUT.max; i += 1) {
      await post(auth, "/sign-in/email-otp", signInBody(email), ip);
    }

    // A cross-site navigation fails formCsrfMiddleware with 403. If the lockout
    // answered 429 without running that check first, this would be 429.
    const locked = await post(auth, "/sign-in/email-otp", signInBody(email), ip, {
      origin: null,
      extra: { "sec-fetch-site": "cross-site", "sec-fetch-mode": "navigate" },
    });
    expect(locked.status).toBe(403);
  });

  it("applies the email-only sign-in cap across IPs, and counts denied attempts", async () => {
    const { auth } = buildAuth();
    const email = "bot@example.com";
    const perIp = OTP_SIGN_IN_EMAIL_IP_LOCKOUT.max;

    // 10 from IP 1 are allowed (the email+IP max). 10 more from IP 1 are denied
    // by the pair limit, but each still counts toward the email-only cap.
    for (let i = 0; i < perIp + 10; i += 1) {
      await post(auth, "/sign-in/email-otp", signInBody(email), "198.51.100.1");
    }
    // 10 more from IP 2 bring the email-only count to 30.
    for (let i = 0; i < OTP_SIGN_IN_EMAIL_LOCKOUT.max - perIp - 10; i += 1) {
      const response = await post(auth, "/sign-in/email-otp", signInBody(email), "198.51.100.2");
      expect(response.status).not.toBe(429);
    }

    const locked = await post(auth, "/sign-in/email-otp", signInBody(email), "198.51.100.3");
    expect(locked.status).toBe(429);
  });

  it("uses one shared 'unknown' bucket for requests without a resolvable IP", async () => {
    const { auth, sendVerificationOTP } = buildAuth(undefined, {
      ipAddress: { disableIpTracking: true },
    });
    const email = "bot@example.com";

    for (let i = 0; i < OTP_SEND_EMAIL_IP_LOCKOUT.max; i += 1) {
      await post(auth, "/email-otp/send-verification-otp", sendBody(email));
    }
    await post(auth, "/email-otp/send-verification-otp", sendBody(email));

    await vi.waitFor(() =>
      expect(sendVerificationOTP).toHaveBeenCalledTimes(OTP_SEND_EMAIL_IP_LOCKOUT.max),
    );
  });

  it("counts emails by their normalized form", async () => {
    const { auth, sendVerificationOTP } = buildAuth();
    const ip = "198.51.100.1";

    for (let i = 0; i < OTP_SEND_EMAIL_IP_LOCKOUT.max; i += 1) {
      // The endpoint validates the address before the send, so only case varies here.
      const email = i % 2 === 0 ? "Bot@Example.com" : "bot@example.COM";
      await post(auth, "/email-otp/send-verification-otp", sendBody(email), ip);
    }
    await vi.waitFor(() =>
      expect(sendVerificationOTP).toHaveBeenCalledTimes(OTP_SEND_EMAIL_IP_LOCKOUT.max),
    );

    await post(auth, "/email-otp/send-verification-otp", sendBody("BOT@example.com"), ip);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sendVerificationOTP).toHaveBeenCalledTimes(OTP_SEND_EMAIL_IP_LOCKOUT.max);
  });
});
