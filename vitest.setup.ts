import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
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
  cleanup();
  vi.restoreAllMocks();
});

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/server", () => ({
  after: vi.fn((fn: () => unknown) => fn()),
  NextResponse: {
    json: vi.fn((data: unknown) => ({ data, status: 200 })),
  },
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({
    get: vi.fn(),
    set: vi.fn(),
  })),
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
  captureException: vi.fn(),
  capture: vi.fn(),
}));
