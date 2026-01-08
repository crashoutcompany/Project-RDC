/**
 * Mock implementation of better-auth for Jest tests.
 * This prevents ESM import issues with the actual better-auth package.
 */
export const betterAuth = jest.fn(() => ({
  api: {
    getSession: jest.fn(),
  },
}));

export const prismaAdapter = jest.fn(() => ({}));

export const nextCookies = jest.fn(() => ({}));

export default betterAuth;
