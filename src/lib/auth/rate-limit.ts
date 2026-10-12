// shared:auth-rate-limit v2
//
// Rate limiting for Better Auth, generic across apps. Two pieces:
//
// 1. A `RateLimitStore` (the shape Better Auth 1.7.x expects for
//    `rateLimit.customStorage`: a single `consume(key, rule)`). It is backed by
//    Upstash Redis when a complete URL + token pair is set (UPSTASH_REDIS_REST_*
//    or the Vercel KV_REST_API_* names), and by memory otherwise. If Redis
//    errors or times out, that call falls back to memory, so limits still apply
//    per instance during an outage.
// 2. A per-email lockout plugin for the email OTP routes. It counts every email
//    the same way, listed or not, so the lockout reveals nothing about the
//    allowlist.
//
// Only sign-in, sign-up, email OTP and lockout keys go to Redis (see
// `isSharedRateLimitKey`); other paths stay in memory.
//
// Every storage key is an HMAC-SHA256 digest keyed by the app's secret, so
// neither Redis nor memory holds a raw email or IP.
//
// Better Auth applies `rateLimit.customStorage` per IP and path, before any
// plugin hook runs. The per-email lockout is a before hook. See the notes on
// `createOtpEmailLockoutPlugin` for ordering.

import { createHmac } from "node:crypto";

import { Redis } from "@upstash/redis";
import type { BetterAuthPlugin } from "better-auth";
import {
  APIError,
  createAuthMiddleware,
  formCsrfMiddleware,
  getIP,
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
  /** Names set by Vercel's Upstash integration. Used when the UPSTASH_* pair is unset. */
  KV_REST_API_URL?: string;
  KV_REST_API_TOKEN?: string;
  AUTH_RATE_LIMIT_PREFIX?: string;
  VERCEL_ENV?: string;
  NODE_ENV?: string;
};

/** Upper bound for one Redis round trip before the call falls back to memory. */
export const REDIS_TIMEOUT_MS = 1000;
/** At most one `auth_rate_limit_redis_unavailable` log line per this interval. */
export const REDIS_UNAVAILABLE_LOG_INTERVAL_MS = 60_000;
/** Memory fallback cap. Expired entries are pruned first, then the oldest. */
const MEMORY_MAX_ENTRIES = 50_000;

const OTP_LOCKOUT_WINDOW_SECONDS = 15 * 60;

/** Sends allowed for one email from one client IP per window. */
export const OTP_SEND_EMAIL_IP_LOCKOUT: RateLimitRule = {
  window: OTP_LOCKOUT_WINDOW_SECONDS,
  max: 5,
};
/** Sign-in attempts allowed for one email from one client IP per window. */
export const OTP_SIGN_IN_EMAIL_IP_LOCKOUT: RateLimitRule = {
  window: OTP_LOCKOUT_WINDOW_SECONDS,
  max: 10,
};
/** Looser cap on sends for one email from any IP per window. */
export const OTP_SEND_EMAIL_LOCKOUT: RateLimitRule = {
  window: OTP_LOCKOUT_WINDOW_SECONDS,
  max: 20,
};
/** Looser cap on sign-in attempts for one email from any IP per window. */
export const OTP_SIGN_IN_EMAIL_LOCKOUT: RateLimitRule = {
  window: OTP_LOCKOUT_WINDOW_SECONDS,
  max: 30,
};

/** Bucket used when no client IP can be resolved. */
export const UNKNOWN_IP_BUCKET = "unknown";

export const OTP_SEND_PATH = "/email-otp/send-verification-otp";
export const OTP_SIGN_IN_PATH = "/sign-in/email-otp";

const STORAGE_NAMESPACE = "auth-rl";

/** Key prefixes for the per-email lockout counters. */
const LOCKOUT_KEY_PREFIXES = [
  "otp-send:",
  "otp-send-email:",
  "otp-sign-in:",
  "otp-sign-in-email:",
] as const;

/**
 * Keys that go to Redis: the per-email lockout and Better Auth's per-IP keys
 * (`<ip>|<path>`) for sign-in, sign-up and email OTP routes. Everything else
 * (for example `get-session`) stays in memory, so ordinary requests never pay
 * for a Redis round trip.
 */
export function isSharedRateLimitKey(key: string): boolean {
  if (LOCKOUT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
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
 * Storage keys are HMAC-SHA256 digests keyed by the app secret. Without the
 * secret, a stored key cannot be matched against a guessed email or IP.
 */
function hashKey(secret: string, key: string): string {
  return createHmac("sha256", secret).update(key).digest("hex");
}

/**
 * Turns an app name into a slug such as "Pocket Trading" -> "pocket-trading".
 */
export function rateLimitPrefixFromAppName(appName: string): string {
  return appName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type MemoryRateLimitStoreOptions = {
  /** HMAC key for storage keys. Any stable app secret works. */
  secret: string;
  now?: () => number;
};

/**
 * In-memory fixed-window counter. Each key allows `rule.max` requests in the
 * `rule.window` seconds that start with its first request. This store is per
 * process.
 */
export function createMemoryRateLimitStore({
  secret,
  now = Date.now,
}: MemoryRateLimitStoreOptions): RateLimitStore {
  if (!secret) throw new Error("Rate limiting needs a secret");
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
      const id = hashKey(secret, key);
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
 * Increments the counter and makes sure it has an expiry, in one script. Redis
 * runs a script atomically, so the key cannot expire between INCR and EXPIRE.
 * The EXPIRE runs when the key was just created (count == 1) or when it has no
 * TTL (ttl == -1). The second case also repairs keys written without an expiry
 * by an earlier version, so they stop being permanent lockouts.
 * Returns { count, ttl } with ttl in seconds.
 */
const CONSUME_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
local ttl = redis.call('TTL', KEYS[1])
if count == 1 or ttl == -1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {count, ttl}
`;

async function redisConsume(
  redis: Redis,
  storageKey: string,
  rule: RateLimitRule,
): Promise<RateLimitDecision> {
  const result = await redis.eval<string[], [number, number]>(
    CONSUME_SCRIPT,
    [storageKey],
    [String(rule.window)],
  );
  const [count, ttl] = Array.isArray(result) ? result : [];
  if (typeof count !== "number" || typeof ttl !== "number") {
    throw new TypeError("Unexpected rate-limit script result from Redis");
  }
  const allowed = count <= rule.max;
  return {
    allowed,
    retryAfter: allowed ? null : ttl > 0 ? ttl : rule.window,
  };
}

export type RateLimitStoreOptions = {
  env: RateLimitEnv;
  /** App slug, e.g. `rateLimitPrefixFromAppName(appName)`. Used when AUTH_RATE_LIMIT_PREFIX is unset. */
  appSlug: string;
  /** HMAC key for storage keys. Typically the Better Auth secret. */
  secret: string;
};

function readValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

/**
 * The first complete URL + token pair wins: UPSTASH_REDIS_REST_* first, then
 * the Vercel KV_REST_API_* names. A lone variable is not used.
 */
function resolveRedisCredentials(
  env: RateLimitEnv,
): { url: string; token: string } | null {
  const pairs = [
    [readValue(env.UPSTASH_REDIS_REST_URL), readValue(env.UPSTASH_REDIS_REST_TOKEN)],
    [readValue(env.KV_REST_API_URL), readValue(env.KV_REST_API_TOKEN)],
  ] as const;
  for (const [url, token] of pairs) {
    if (url && token) return { url, token };
  }
  const anySet = [
    env.UPSTASH_REDIS_REST_URL,
    env.UPSTASH_REDIS_REST_TOKEN,
    env.KV_REST_API_URL,
    env.KV_REST_API_TOKEN,
  ].some((value) => readValue(value));
  if (anySet) {
    console.warn(
      "[auth] rate limiting uses memory only: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or KV_REST_API_URL and KV_REST_API_TOKEN).",
    );
  }
  return null;
}

/**
 * The key prefix. AUTH_RATE_LIMIT_PREFIX wins when set. Otherwise it is
 * `<appSlug>:<environment>`, where the environment is VERCEL_ENV, then
 * NODE_ENV, then "development". Keep the prefix different per environment
 * when one Upstash database is shared, so a preview run cannot lock out
 * production.
 */
export function resolveRateLimitPrefix(
  env: RateLimitEnv,
  appSlug: string,
): string {
  const explicit = readValue(env.AUTH_RATE_LIMIT_PREFIX);
  if (explicit) return explicit;
  const slug = appSlug.trim();
  if (!slug) {
    throw new Error("Rate limiting needs AUTH_RATE_LIMIT_PREFIX or an app slug");
  }
  const environment =
    readValue(env.VERCEL_ENV) ?? readValue(env.NODE_ENV) ?? "development";
  return `${slug}:${environment}`;
}

/**
 * Builds the store for one auth instance. Redis is used only when a complete
 * URL + token pair is set. Every Redis key is `<prefix>:auth-rl:<hmac>`.
 *
 * The Redis client does not retry (`retry: { retries: 0 }`). A retried INCR
 * can run twice after the REDIS_TIMEOUT_MS fallback, which would double-count.
 *
 * `consume` never throws. A Redis error or a call over REDIS_TIMEOUT_MS is
 * answered by the memory store for that call, and logs
 * `auth_rate_limit_redis_unavailable` at most once per log interval. The log
 * has the reason and error name only, with no keys, emails or IPs.
 */
export function createAuthRateLimitStore({
  env,
  appSlug,
  secret,
}: RateLimitStoreOptions): RateLimitStore {
  const memory = createMemoryRateLimitStore({ secret });
  const credentials = resolveRedisCredentials(env);
  if (!credentials) return memory;

  const prefix = resolveRateLimitPrefix(env, appSlug);
  const redis = new Redis({
    url: credentials.url,
    token: credentials.token,
    retry: { retries: 0 },
  });

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
      const storageKey = `${prefix}:${STORAGE_NAMESPACE}:${hashKey(secret, key)}`;
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

export type OtpEmailLockoutLimits = {
  sendEmailIp: RateLimitRule;
  signInEmailIp: RateLimitRule;
  sendEmail: RateLimitRule;
  signInEmail: RateLimitRule;
};

export const DEFAULT_OTP_EMAIL_LOCKOUT_LIMITS: OtpEmailLockoutLimits = {
  sendEmailIp: OTP_SEND_EMAIL_IP_LOCKOUT,
  signInEmailIp: OTP_SIGN_IN_EMAIL_IP_LOCKOUT,
  sendEmail: OTP_SEND_EMAIL_LOCKOUT,
  signInEmail: OTP_SIGN_IN_EMAIL_LOCKOUT,
};

export type OtpEmailLockoutOptions = {
  store: RateLimitStore;
  /** The app's one email rule, e.g. trim + lowercase. Keys are built from its output. */
  normalizeEmail: (email: string) => string;
  limits?: Partial<OtpEmailLockoutLimits>;
};

function readEmail(body: unknown, normalizeEmail: (email: string) => string) {
  const email = (body as { email?: unknown } | undefined)?.email;
  if (typeof email !== "string") return null;
  const normalized = normalizeEmail(email);
  return normalized === "" ? null : normalized;
}

/**
 * Consumes both counters for one request: email+IP and email-only. Both run
 * even when the first one denies, so each counter sees every request. The
 * result is denied when either counter is over its limit, with the longer
 * retry time.
 */
async function consumeEmailLockout(
  store: RateLimitStore,
  scope: "otp-send" | "otp-sign-in",
  email: string,
  ip: string,
  emailIpRule: RateLimitRule,
  emailRule: RateLimitRule,
): Promise<RateLimitDecision> {
  const [pair, emailOnly] = await Promise.all([
    store.consume(`${scope}:${email}|${ip}`, emailIpRule),
    store.consume(`${scope}-email:${email}`, emailRule),
  ]);
  if (pair.allowed && emailOnly.allowed) {
    return { allowed: true, retryAfter: null };
  }
  const retryAfters = [pair, emailOnly]
    .filter((decision) => !decision.allowed)
    .map((decision) => decision.retryAfter ?? 1);
  return { allowed: false, retryAfter: Math.max(...retryAfters) };
}

/**
 * Per-email lockout for the email OTP routes, on top of Better Auth's per-IP
 * limiter. Every email is counted, listed or not, so a lockout response is the
 * same for every address. Each request counts twice: once for the email+IP
 * pair (tight) and once for the email alone (looser, so one email cannot be
 * hammered from many IPs). An unresolvable IP counts in the "unknown" bucket.
 *
 * - send (`/email-otp/send-verification-otp`): over the limit, the endpoint's
 *   own `{ success: true }` 200 body is returned after the same CSRF check the
 *   endpoint runs. Nothing is stored or sent.
 * - sign-in (`/sign-in/email-otp`): over the limit, the same CSRF check, then
 *   429 TOO_MANY_REQUESTS with a `Retry-After` header (seconds). No code is
 *   checked.
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
  limits,
}: OtpEmailLockoutOptions): BetterAuthPlugin {
  const rules = { ...DEFAULT_OTP_EMAIL_LOCKOUT_LIMITS, ...limits };
  return {
    id: "otp-email-lockout",
    hooks: {
      before: [
        {
          matcher: (context) => context.path === OTP_SEND_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const email = readEmail(ctx.body, normalizeEmail);
            if (!email) return;
            const ip = clientIp(ctx);
            const decision = await consumeEmailLockout(
              store,
              "otp-send",
              email,
              ip,
              rules.sendEmailIp,
              rules.sendEmail,
            );
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
            const ip = clientIp(ctx);
            const decision = await consumeEmailLockout(
              store,
              "otp-sign-in",
              email,
              ip,
              rules.signInEmailIp,
              rules.signInEmail,
            );
            if (decision.allowed) return;
            await formCsrfMiddleware(ctx);
            throw new APIError(
              "TOO_MANY_REQUESTS",
              {
                code: "TOO_MANY_REQUESTS",
                message: "Too many requests. Please try again later.",
              },
              { "Retry-After": String(decision.retryAfter ?? 1) },
            );
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
}

/** The client IP as Better Auth resolves it, or the shared "unknown" bucket. */
function clientIp(ctx: {
  request?: Request;
  context: { options: Parameters<typeof getIP>[1] };
}): string {
  const ip = ctx.request ? getIP(ctx.request, ctx.context.options) : null;
  return ip ?? UNKNOWN_IP_BUCKET;
}
