import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: "./",
});

// Add any custom config to be passed to Jest
const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jest-fixed-jsdom",
  roots: ["<rootDir>/src"],
  moduleNameMapper: {
    "^@/components/(.*)$": "<rootDir>/src/components/$1",
    "^@/lib/(.*)$": "<rootDir>/src/lib/$1",
    "^@/hooks/(.*)$": "<rootDir>/src/hooks/$1",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^prisma/(.*)$": "<rootDir>/prisma/$1",
    "prisma/db": "<rootDir>/src/app/__tests__/__mocks__/prisma.ts",
    // Mock ESM packages that Jest can't handle
    "^better-auth$": "<rootDir>/src/app/__tests__/__mocks__/better-auth.ts",
    "^better-auth/adapters/prisma$":
      "<rootDir>/src/app/__tests__/__mocks__/better-auth.ts",
    "^better-auth/next-js$":
      "<rootDir>/src/app/__tests__/__mocks__/better-auth.ts",
    // Mock PostHog to avoid API key validation in tests
    "^posthog-node$": "<rootDir>/src/app/__tests__/__mocks__/posthog-node.ts",
  },
  testMatch: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
};

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config);
