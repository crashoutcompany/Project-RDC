import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const mockDirectory = path.resolve(
  import.meta.dirname,
  "src/app/__tests__/__mocks__",
);

const resolve = {
  alias: [
    {
      find: /^@\/generated\/prisma\/sql$/,
      replacement: path.join(mockDirectory, "prisma-sql.ts"),
    },
    { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
    {
      find: /^prisma\/db$/,
      replacement: path.join(mockDirectory, "prisma.ts"),
    },
    {
      find: /^prisma\/(.*)$/,
      replacement: path.resolve(import.meta.dirname, "prisma/$1"),
    },
    {
      find: /^better-auth$/,
      replacement: path.join(mockDirectory, "better-auth.ts"),
    },
    {
      find: /^better-auth\/adapters\/prisma$/,
      replacement: path.join(mockDirectory, "better-auth.ts"),
    },
    {
      find: /^better-auth\/next-js$/,
      replacement: path.join(mockDirectory, "better-auth.ts"),
    },
    {
      find: /^posthog-node$/,
      replacement: path.join(mockDirectory, "posthog-node.ts"),
    },
  ],
};

const testEnv = {
  DATABASE_URL:
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/ci",
  DIRECT_URL:
    process.env.DIRECT_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5432/ci",
  BETTER_AUTH_SECRET:
    process.env.BETTER_AUTH_SECRET ??
    "test-better-auth-secret-at-least-32-characters",
};

export default defineConfig({
  plugins: [react()],
  resolve,
  test: {
    globals: true,
    env: testEnv,
    exclude: ["**/node_modules/**", "**/.next/**", "**/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          globals: true,
          env: testEnv,
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/lib/**/*.test.ts", "src/lib/**/__tests__/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          globals: true,
          env: testEnv,
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
          exclude: [
            "src/lib/**",
            "**/node_modules/**",
            "**/.next/**",
            "**/e2e/**",
          ],
        },
      },
    ],
  },
});
