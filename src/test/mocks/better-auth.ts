/**
 * Mock implementation of better-auth for Vitest.
 * This prevents ESM import issues with the actual better-auth package.
 */
import { vi } from "vitest";

export const betterAuth = vi.fn(() => ({
  api: {
    getSession: vi.fn(),
  },
}));

export const prismaAdapter = vi.fn(() => ({}));

export const nextCookies = vi.fn(() => ({}));

export default betterAuth;
