/**
 * One error policy for every vision provider (Gemini via the AI SDK, OpenAI
 * Decisions, Azure Document Intelligence), so the admin form and the harvester
 * retry and fall back the same way.
 *
 * - retryable: rate limits (429), overload/5xx, timeouts, dropped connections.
 *   Worth another try after a pause.
 * - fatal: bad key, exhausted quota, invalid output, refusals, bad requests.
 *   Retrying won't help, so move to the fallback straight away.
 */
export type ApiErrorKind = "retryable" | "fatal";

export interface ClassifiedError {
  kind: ApiErrorKind;
  /** Short label for logs and fallback records, e.g. "rate limited (429)". */
  reason: string;
  status?: number;
  /** From a Retry-After header, when the provider sent one. */
  retryAfterMs?: number;
}

/** Thrown by readers for answers that can't be used (schema mismatch, refusal). */
export class UnusableOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnusableOutputError";
  }
}

const NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/** Daily/billing quota, as opposed to a per-minute rate limit: waiting won't fix it today. */
const QUOTA_EXHAUSTED = /insufficient_quota|billing|PerDay|per day|quota exceeded for quota metric .*per day|exceeded your current quota/i;

export function classifyApiError(err: unknown): ClassifiedError {
  const e = unwrap(err) as Record<string, unknown> | undefined;
  const name = typeof e?.name === "string" ? e.name : "";
  const message = err instanceof Error ? err.message : String(err);

  if (name === "UnusableOutputError" || name === "AI_NoObjectGeneratedError" || name === "AI_TypeValidationError")
    return { kind: "fatal", reason: `unusable output: ${message}` };
  if (name === "AbortError" || name === "TimeoutError")
    return { kind: "retryable", reason: "timed out" };

  const status = statusOf(e);
  const body = bodyOf(e);
  if (status !== undefined) {
    const retryAfterMs = retryAfterOf(e);
    if (status === 429) {
      if (QUOTA_EXHAUSTED.test(`${body} ${message} ${String(e?.code ?? "")}`))
        return { kind: "fatal", reason: "quota exhausted (429)", status };
      return { kind: "retryable", reason: "rate limited (429)", status, retryAfterMs };
    }
    if (status === 408 || status >= 500)
      return { kind: "retryable", reason: `server error (${status})`, status, retryAfterMs };
    if (status === 401 || status === 403)
      return { kind: "fatal", reason: `not authorized (${status})`, status };
    return { kind: "fatal", reason: `request rejected (${status}): ${message.slice(0, 200)}`, status };
  }

  const code = String(e?.code ?? (e?.cause as Record<string, unknown> | undefined)?.code ?? "");
  if (NETWORK_CODES.has(code) || /fetch failed|socket hang up|network/i.test(message))
    return { kind: "retryable", reason: `network error${code ? ` (${code})` : ""}` };

  return { kind: "fatal", reason: message.slice(0, 200) };
}

export interface RetryOptions {
  /** Extra attempts after the first. */
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (info: ClassifiedError & { attempt: number; delayMs: number }) => void;
  /** Injected in tests. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Runs `fn`, retrying retryable errors with exponential backoff (honoring
 * Retry-After). Fatal errors and the last retryable one are rethrown with the
 * classification attached as `error.classified`.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const { retries = 2, baseDelayMs = 1000, maxDelayMs = 30_000 } = opts;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const classified = classifyApiError(err);
      if (classified.kind === "fatal" || attempt >= retries) throw attachClassification(err, classified);
      const backoff = baseDelayMs * 2 ** attempt * (0.75 + Math.random() * 0.5);
      const delayMs = Math.min(maxDelayMs, classified.retryAfterMs ?? backoff);
      opts.onRetry?.({ ...classified, attempt: attempt + 1, delayMs });
      await sleep(delayMs);
    }
  }
}

/** The classification `withRetry` attached, or a fresh one. */
export function classificationOf(err: unknown): ClassifiedError {
  const attached = (err as { classified?: ClassifiedError } | null)?.classified;
  return attached ?? classifyApiError(err);
}

function attachClassification(err: unknown, classified: ClassifiedError): unknown {
  if (err && typeof err === "object") {
    Object.assign(err, { classified });
    return err;
  }
  return Object.assign(new Error(String(err)), { classified });
}

/** AI SDK RetryError wraps the real error; dig it out. */
function unwrap(err: unknown): unknown {
  const e = err as { name?: string; lastError?: unknown } | null;
  if (e?.name === "AI_RetryError" && e.lastError) return unwrap(e.lastError);
  return err;
}

function statusOf(e: Record<string, unknown> | undefined): number | undefined {
  // OpenAI: status. AI SDK: statusCode. Azure REST errors: statusCode, or a numeric string code.
  for (const v of [e?.status, e?.statusCode, (e?.response as Record<string, unknown> | undefined)?.status])
    if (typeof v === "number") return v;
  if (typeof e?.code === "string" && /^\d{3}$/.test(e.code)) return Number(e.code);
  if (e?.code === "TooManyRequests") return 429;
  return undefined;
}

function bodyOf(e: Record<string, unknown> | undefined): string {
  const parts = [e?.responseBody, e?.error, e?.type, e?.innererror];
  return parts.map((p) => (typeof p === "string" ? p : p ? JSON.stringify(p) : "")).join(" ");
}

function retryAfterOf(e: Record<string, unknown> | undefined): number | undefined {
  const headers = (e?.headers ?? e?.responseHeaders) as Headers | Record<string, string> | undefined;
  if (!headers) return undefined;
  const raw =
    typeof (headers as Headers).get === "function"
      ? (headers as Headers).get("retry-after")
      : ((headers as Record<string, string>)["retry-after"] ?? (headers as Record<string, string>)["Retry-After"]);
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}
