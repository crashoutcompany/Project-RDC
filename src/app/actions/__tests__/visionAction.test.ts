import { afterEach, describe, expect, it, vi } from "vitest";

const after = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after }));

const readWithFallback = vi.hoisted(() => vi.fn());
vi.mock("@/lib/vision/readers", () => ({
  readWithFallback,
  createReaders: () => ({}),
  primaryReaderFromEnv: () => "gemini",
  readerChain: () => [],
}));

const logVisionError = vi.hoisted(() => vi.fn(async () => {}));
const logVisionSuccess = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@/posthog/server-analytics", () => ({ logVisionError, logVisionSuccess }));

import { VisionResultCodes } from "@/lib/constants";
import { analyzeScreenShot } from "../visionAction";

const failedOutcome = {
  result: { status: VisionResultCodes.Failed, message: "gemini: not authorized (401); azure: no document" },
  readerId: "azure" as const,
  fallbacks: [{ from: "gemini" as const, reason: "not authorized (401)" }],
};

afterEach(() => {
  vi.restoreAllMocks();
  after.mockReset();
  logVisionError.mockClear();
  logVisionSuccess.mockClear();
  readWithFallback.mockReset();
});

describe("analyzeScreenShot logging", () => {
  it("logs a failure with the reader and each fallback reason via after()", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    readWithFallback.mockResolvedValue(failedOutcome);

    const result = await analyzeScreenShot("", [], 2);

    expect(result).toEqual(failedOutcome.result);
    expect(after).toHaveBeenCalledTimes(1);
    await after.mock.calls[0][0]();
    expect(logVisionError).toHaveBeenCalledWith(expect.any(Error), {
      readerId: "azure",
      fallbacks: ["gemini: not authorized (401)"],
    });
  });

  it("still returns Failed and logs directly when after() throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    after.mockImplementation(() => {
      throw new Error("after() was called outside a request scope");
    });
    readWithFallback.mockResolvedValue(failedOutcome);

    const result = await analyzeScreenShot("", [], 2);

    expect(result).toEqual(failedOutcome.result);
    expect(logVisionError).toHaveBeenCalledWith(expect.any(Error), {
      readerId: "azure",
      fallbacks: ["gemini: not authorized (401)"],
    });
  });

  it("returns Failed when the reader chain throws, even if after() also throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    after.mockImplementation(() => {
      throw new Error("no request scope");
    });
    readWithFallback.mockRejectedValue(new Error("boom"));

    const result = await analyzeScreenShot("", [], 2);

    expect(result).toEqual({ status: VisionResultCodes.Failed, message: "boom" });
    expect(logVisionError).toHaveBeenCalledWith(expect.objectContaining({ message: "boom" }));
  });
});
