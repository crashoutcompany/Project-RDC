import { describe, expect, it, vi } from "vitest";
import { classifyApiError, UnusableOutputError, withRetry } from "../api-errors";

const httpError = (status: number, extra: Record<string, unknown> = {}) =>
  Object.assign(new Error(`HTTP ${status}`), { status, ...extra });

describe("classifyApiError", () => {
  it.each([
    ["a rate limit", httpError(429), "retryable"],
    ["an overloaded server", httpError(503), "retryable"],
    ["an AI SDK server error", Object.assign(new Error("x"), { name: "AI_APICallError", statusCode: 500 }), "retryable"],
    ["a dropped connection", Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNRESET" } }), "retryable"],
    ["a timeout", Object.assign(new Error("t"), { name: "TimeoutError" }), "retryable"],
    ["exhausted OpenAI quota", httpError(429, { code: "insufficient_quota" }), "fatal"],
    ["exhausted Gemini daily quota", Object.assign(new Error("q"), { statusCode: 429, responseBody: "Quota exceeded for GenerateRequestsPerDayPerProjectPerModel" }), "fatal"],
    ["a bad key", httpError(401), "fatal"],
    ["a bad request", httpError(400), "fatal"],
    ["unusable output", new UnusableOutputError("not JSON"), "fatal"],
    ["schema mismatch from the AI SDK", Object.assign(new Error("no object"), { name: "AI_NoObjectGeneratedError" }), "fatal"],
  ])("treats %s as %s", (_label, err, kind) => {
    expect(classifyApiError(err).kind).toBe(kind);
  });

  it("reads Retry-After", () => {
    const err = httpError(429, { headers: new Headers({ "retry-after": "7" }) });
    expect(classifyApiError(err).retryAfterMs).toBe(7000);
  });

  it("unwraps the AI SDK's RetryError", () => {
    const err = Object.assign(new Error("retry"), { name: "AI_RetryError", lastError: httpError(401) });
    expect(classifyApiError(err)).toMatchObject({ kind: "fatal", status: 401 });
  });
});

describe("withRetry", () => {
  const sleep = vi.fn(async () => {});

  it("retries retryable errors, then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(httpError(429)).mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retries and rethrows", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(503));
    await expect(withRetry(fn, { retries: 2, sleep })).rejects.toMatchObject({ status: 503 });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("doesn't retry fatal errors", async () => {
    const fn = vi.fn().mockRejectedValue(httpError(401));
    await expect(withRetry(fn, { sleep })).rejects.toMatchObject({ classified: { kind: "fatal" } });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("waits as long as Retry-After asks, up to the cap", async () => {
    const waits: number[] = [];
    const fn = vi
      .fn()
      .mockRejectedValueOnce(httpError(429, { headers: new Headers({ "retry-after": "3" }) }))
      .mockResolvedValue("ok");
    await withRetry(fn, { sleep: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([3000]);
  });
});
