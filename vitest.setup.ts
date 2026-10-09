import { afterEach, beforeEach, vi } from "vitest";

const noop = () => {};

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(noop);
  vi.spyOn(console, "warn").mockImplementation(noop);
  vi.spyOn(console, "error").mockImplementation(noop);
  vi.spyOn(console, "info").mockImplementation(noop);
  vi.spyOn(console, "debug").mockImplementation(noop);
  vi.spyOn(console, "group").mockImplementation(noop);
  vi.spyOn(console, "groupEnd").mockImplementation(noop);
});

afterEach(() => {
  vi.restoreAllMocks();
});

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((fn: () => unknown) => fn()),
  };
});

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
}));

// Server actions read the caller through these; drive them with `signInAs`
// from src/test/session.ts. Defaults to signed out.
vi.mock("@/lib/auth/server", () => ({
  getAuthoritativeSession: vi.fn(async () => null),
  getRscSession: vi.fn(async () => null),
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn(), signOut: vi.fn() } },
}));

vi.mock("@/lib/config", () => ({
  default: {
    YOUTUBE_API_KEY: "test-youtube-key",
    DOCUMENT_INTELLIGENCE_ENDPOINT: "https://example.test",
    DOCUMENT_INTELLIGENCE_API_KEY: "test-key",
  },
}));

vi.mock("@/posthog/server-analytics", () => ({
  logAdminAction: vi.fn(),
  logFormError: vi.fn(),
  logFormSuccess: vi.fn(),
  logVisionAction: vi.fn(),
  logVisionError: vi.fn(),
  logVisionSuccess: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/posthog/server-init", () => ({
  default: { capture: vi.fn(), captureException: vi.fn() },
}));
