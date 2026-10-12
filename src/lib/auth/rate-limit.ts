// shared:auth-rate-limit v1
//
// Rate limiting for Better Auth, generic across apps. Two pieces:
//
// 1. A `RateLimitStore` (the shape Better Auth 1.7.x expects for
//    `rateLimit.customStorage`: a single atomic `consume(key, rule)`). It is
//    backed by Upstash Redis when UPSTASH_REDIS_REST_URL and
//    UPSTASH_REDIS_REST_TOKEN are both set, and by memory otherwise. If Redis
//    errors or times out, that call falls back to memory, so limits still apply
//    per instance during an outage.
// 2. A per-email lockout plugin for the email OTP routes. It counts every email
//    the same way, listed or not, so the lockout reveals nothing about the
//    allowlist.
//
// Only sign-in, sign-up, email OTP and lockout keys go to Redis (see
// `isSharedRateLimitKey`); other paths stay in memory.
//
// Better Auth applies `rateLimit.customStorage` per IP and path, before any
// plugin hook runs. The per-email lockout is a before hook. See the notes on
// `createOtpEmailLockoutPlugin` for ordering.

import { createHash } from "node:crypto";

import { Redis } from "@upstash/redis";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  formCsrfMiddleware,
} from "better-auth/api";

export type RateLimitRule = {
  /** Window length in seconds. */
  window: number;
  /** Requests allowed per window. */
  max: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  /** Seconds until the window frees up. Set only when `allowed` is false. */
  retryAfter: number | null;
};

/** Structurally compatible with Better Auth's `rateLimit.customStorage`. */
export type RateLimitStore = {
  consume(key: string, rule: RateLimitRule): Promise<RateLimitDecision>;
};

export type RateLimitEnv = {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  AUTH_RATE_LIMIT_PREFIX?: string;
};

/** Upper bound for one Redis round trip before the call falls back to memory. */
export const REDIS_TIMEOUT_MS = 1000;
/** At most one `auth_rate_limit_redis_unavailable` log line per this interval. */
export const REDIS_UNAVAILABLE_LOG_INTERVAL_MS = 60_000;
/** Memory fallback cap. Expired entries are pruned first, then the oldest. */
const MEMORY_MAX_ENTRIES = 50_000;

/** Per-email send limit: sends allowed per email per window. */
export const OTP_SEND_LOCKOUT: RateLimitRule = { window: 15 * 60, max: 5 };
/** Per-email sign-in limit: sign-in attempts allowed per email per window. */
export const OTP_SIGN_IN_LOCKOUT: RateLimitRule = { window: 15 * 60, max: 10 };

export const OTP_SEND_PATH = "/email-otp/send-verification-otp";
export const OTP_SIGN_IN_PATH = "/sign-in/email-otp";

const STORAGE_NAMESPACE = "auth-rl";

/**
 * Keys that go to Redis: the per-email lockout and Better Auth's per-IP keys
 * (`<ip>|<path>`) for sign-in, sign-up and email OTP routes. Everything else
 * (for example `get-session`) stays in memory, so ordinary requests never pay
 * for a Redis round trip.
 */
export function isSharedRateLimitKey(key: string): boolean {
  if (key.startsWith("otp-send:") || key.startsWith("otp-sign-in:")) {
    return true;
  }
  const path = key.slice(key.lastIndexOf("|") + 1);
  return (
    path.startsWith("/sign-in") ||
    path.startsWith("/sign-up") ||
    path.startsWith("/email-otp")
  );
}

/**
 * Storage keys are SHA-256 digests, so Redis and memory never hold a raw
 * email or IP. The digest is taken over the whole logical key.
 */
function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Turns an app name into a prefix such as "Pocket Trading" -> "pocket-trading".
 * Used as the default when AUTH_RATE_LIMIT_PREFIX is not set.
 */
export function rateLimitPrefixFromAppName(appName: string): string {
  return appName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * In-memory fixed-window counter. Each key allows `rule.max` requests in the
 * `rule.window` seconds that start with its first request. This store is per
 * process.
 */
export function createMemoryRateLimitStore(
  now: () => number = Date.now,
): RateLimitStore {
  const entries = new Map<string, { count: number; expiresAt: number }>();

  function prune(at: number): void {
    if (entries.size < MEMORY_MAX_ENTRIES) return;
    for (const [key, entry] of entries) {
      if (at >= entry.expiresAt) entries.delete(key);
    }
    for (const key of entries.keys()) {
      if (entries.size < MEMORY_MAX_ENTRIES) break;
      entries.delete(key);
    }
  }

  return {
    async consume(key, rule) {
      const at = now();
      const id = hashKey(key);
      prune(at);
      let entry = entries.get(id);
      if (!entry || at >= entry.expiresAt) {
        entry = { count: 0, expiresAt: at + rule.window * 1000 };
        entries.set(id, entry);
      }
      entry.count += 1;
      const allowed = entry.count <= rule.max;
      return {
        allowed,
        retryAfter: allowed
          ? null
          : Math.max(1, Math.ceil((entry.expiresAt - at) / 1000)),
      };
    },
  };
}

class RedisTimeoutError extends Error {
  constructor() {
    super("Redis rate-limit call timed out");
    this.name = "RedisTimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RedisTimeoutError()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * One Redis round trip: SET NX EX creates the key with its TTL only if it is
 * absent, INCR counts the request, TTL reports the time left. The pipeline
 * runs in order in a single HTTP request. It is not a transaction, but the
 * TTL is set atomically with the key, so no key is left without an expiry.
 */
async function redisConsume(
  redis: Redis,
  storageKey: string,
  rule: RateLimitRule,
): Promise<RateLimitDecision> {
  const [, count, ttl] = await redis
    .pipeline()
    .set(storageKey, 0, { nx: true, ex: rule.window })
    .incr(storageKey)
    .ttl(storageKey)
    .exec<[unknown, number, number]>();

  if (typeof count !== "number") {
    throw new TypeError("Unexpected INCR result from Redis");
  }
  const allowed = count <= rule.max;
  return {
    allowed,
    retryAfter: allowed ? null : ttl > 0 ? ttl : rule.window,
  };
}

export type RateLimitStoreOptions = {
  env: RateLimitEnv;
  /** Used when AUTH_RATE_LIMIT_PREFIX is unset. Typically `rateLimitPrefixFromAppName(appName)`. */
  defaultPrefix: string;
};

/**
 * Builds the store for one auth instance. Redis is used only when both
 * UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set. Every key is
 * prefixed with `<prefix>:auth-rl:` so apps can share one database.
 *
 * `consume` never throws. A Redis error or a call over REDIS_TIMEOUT_MS is
 * answered by the memory store for that call, and logs
 * `auth_rate_limit_redis_unavailable` at most once per log interval. The log
 * has the reason and error name only, with no keys, emails or IPs.
 */
export function createAuthRateLimitStore({
  env,
  defaultPrefix,
}: RateLimitStoreOptions): RateLimitStore {
  const memory = createMemoryRateLimitStore();
  const url = env.UPSTASH_REDIS_REST_URL?.trim() || undefined;
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim() || undefined;

  if (!url || !token) {
    if (url || token) {
      console.warn(
        "[auth] rate limiting uses memory only: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.",
      );
    }
    return memory;
  }

  const prefix = env.AUTH_RATE_LIMIT_PREFIX?.trim() || defaultPrefix.trim();
  if (!prefix) {
    throw new Error("Rate limiting needs AUTH_RATE_LIMIT_PREFIX or a default prefix");
  }
  const redis = new Redis({ url, token });

  let lastLoggedAt = Number.NEGATIVE_INFINITY;
  function logUnavailable(error: unknown): void {
    const at = Date.now();
    if (at - lastLoggedAt < REDIS_UNAVAILABLE_LOG_INTERVAL_MS) return;
    lastLoggedAt = at;
    console.warn("auth_rate_limit_redis_unavailable", {
      reason: error instanceof RedisTimeoutError ? "timeout" : "error",
      errorName: error instanceof Error ? error.name : "unknown",
    });
  }

  return {
    async consume(key, rule) {
      if (!isSharedRateLimitKey(key)) return memory.consume(key, rule);
      const storageKey = `${prefix}:${STORAGE_NAMESPACE}:${hashKey(key)}`;
      try {
        return await withTimeout(
          redisConsume(redis, storageKey, rule),
          REDIS_TIMEOUT_MS,
        );
      } catch (error) {
        logUnavailable(error);
        return memory.consume(key, rule);
      }
    },
  };
}

export type OtpEmailLockoutOptions = {
  store: RateLimitStore;
  /** The app's one email rule, e.g. trim + lowercase. Keys are built from its output. */
  normalizeEmail: (email: string) => string;
  sendLimit?: RateLimitRule;
  signInLimit?: RateLimitRule;
};

function readEmail(body: unknown, normalizeEmail: (email: string) => string) {
  const email = (body as { email?: unknown } | undefined)?.email;
  if (typeof email !== "string") return null;
  const normalized = normalizeEmail(email);
  return normalized === "" ? null : normalized;
}

/**
 * Per-email lockout for the email OTP routes, on top of Better Auth's per-IP
 * limiter. Every email is counted, listed or not, so a lockout response is the
 * same for every address.
 *
 * - send (`/email-otp/send-verification-otp`): over the limit, the endpoint's
 *   own `{ success: true }` 200 body is returned after the same CSRF check the
 *   endpoint runs. Nothing is stored or sent.
 * - sign-in (`/sign-in/email-otp`): over the limit, 429 with a generic
 *   TOO_MANY_REQUESTS body. No code is checked.
 *
 * Hook order: Better Auth runs `hooks.before` in `plugins` array order. Place
 * this plugin before the email OTP allowlist and account guards, so an
 * over-limit request is answered before those guards do any lookup or
 * consume anything. A thrown before hook skips the `after` hooks, so the
 * allowlist's sign-in `after` hook does not rewrite this 429. The email counts
 * use the normalized email. The store hashes every key.
 */
export function createOtpEmailLockoutPlugin({
  store,
  normalizeEmail,
  sendLimit = OTP_SEND_LOCKOUT,
  signInLimit = OTP_SIGN_IN_LOCKOUT,
}: OtpEmailLockoutOptions): BetterAuthPlugin {
  return {
    id: "otp-email-lockout",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === OTP_SEND_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const email = readEmail(ctx.body, normalizeEmail);
            if (!email) return;
            const decision = await store.consume(`otp-send:${email}`, sendLimit);
            if (decision.allowed) return;
            // Same CSRF check the endpoint would run, then its success body.
            await formCsrfMiddleware(ctx);
            return ctx.json({ success: true });
          }),
        },
        {
          matcher: (context) => context.path === OTP_SIGN_IN_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const email = readEmail(ctx.body, normalizeEmail);
            if (!email) return;
            const decision = await store.consume(
              `otp-sign-in:${email}`,
              signInLimit,
            );
            if (decision.allowed) return;
            throw APIError.from("TOO_MANY_REQUESTS", {
              code: "TOO_MANY_REQUESTS",
              message: "Too many requests. Please try again later.",
            });
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}
