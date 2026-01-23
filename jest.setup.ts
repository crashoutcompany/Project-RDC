/**
 * Jest setup - runs before each test file.
 * Mocks console methods to reduce noise in test output.
 */
const noop = () => {};

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(noop);
  jest.spyOn(console, "warn").mockImplementation(noop);
  jest.spyOn(console, "error").mockImplementation(noop);
  jest.spyOn(console, "info").mockImplementation(noop);
  jest.spyOn(console, "debug").mockImplementation(noop);
  jest.spyOn(console, "group").mockImplementation(noop);
  jest.spyOn(console, "groupEnd").mockImplementation(noop);
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Global mocks for Next.js
jest.mock("next/cache", () => ({
  revalidateTag: jest.fn(),
  revalidatePath: jest.fn(),
}));

jest.mock("next/server", () => ({
  after: jest.fn((fn) => fn()),
  NextResponse: {
    json: jest.fn((data) => ({ data, status: 200 })),
  },
}));

jest.mock("next/headers", () => ({
  headers: jest.fn(async () => new Headers()),
  cookies: jest.fn(async () => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

// Global mock for PostHog
jest.mock("@/posthog/server-analytics", () => ({
  logAdminAction: jest.fn(),
  logFormError: jest.fn(),
  logFormSuccess: jest.fn(),
  logVisionAction: jest.fn(),
  logVisionError: jest.fn(),
  logVisionSuccess: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock("@/posthog/server-init", () => ({
  captureException: jest.fn(),
  capture: jest.fn(),
}));
