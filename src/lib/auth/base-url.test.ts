import { describe, expect, it } from "vitest";

import { PRODUCTION_URL } from "./config";
import { isLoopbackUrl, resolveAuthBaseUrl } from "./base-url";

describe("isLoopbackUrl", () => {
  it("detects localhost variants", () => {
    expect(isLoopbackUrl("http://localhost:3999")).toBe(true);
    expect(isLoopbackUrl("http://127.0.0.1:3999")).toBe(true);
    expect(isLoopbackUrl("http://[::1]:3999")).toBe(true);
    expect(isLoopbackUrl(PRODUCTION_URL)).toBe(false);
    expect(isLoopbackUrl("not a url")).toBe(false);
  });
});

describe("resolveAuthBaseUrl", () => {
  it("uses BETTER_AUTH_URL in development even if it is loopback", () => {
    expect(
      resolveAuthBaseUrl(PRODUCTION_URL, {
        NODE_ENV: "development",
        BETTER_AUTH_URL: "http://localhost:4000",
      }),
    ).toBe("http://localhost:4000");
  });

  it("ignores loopback BETTER_AUTH_URL in production", () => {
    expect(
      resolveAuthBaseUrl(PRODUCTION_URL, {
        NODE_ENV: "production",
        BETTER_AUTH_URL: "http://localhost:3999",
      }),
    ).toBe(PRODUCTION_URL);
  });

  it("keeps a non-loopback BETTER_AUTH_URL in production", () => {
    expect(
      resolveAuthBaseUrl(PRODUCTION_URL, {
        NODE_ENV: "production",
        BETTER_AUTH_URL: "https://example.com",
      }),
    ).toBe("https://example.com");
  });

  it("uses the Vercel preview host for preview builds", () => {
    expect(
      resolveAuthBaseUrl(PRODUCTION_URL, {
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        VERCEL_BRANCH_URL: "project-z-git-feat.vercel.app",
      }),
    ).toBe("https://project-z-git-feat.vercel.app");
  });

  it("falls back to localhost in development", () => {
    expect(
      resolveAuthBaseUrl(PRODUCTION_URL, {
        NODE_ENV: "development",
        PORT: "3001",
      }),
    ).toBe("http://localhost:3001");
  });

  it("falls back to the supplied production URL in production", () => {
    expect(resolveAuthBaseUrl(PRODUCTION_URL, { NODE_ENV: "production" })).toBe(
      PRODUCTION_URL,
    );
  });
});
