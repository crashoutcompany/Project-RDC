import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const mockDirectory = path.resolve(
  import.meta.dirname,
  "src/app/__tests__/__mocks__",
);

export default defineConfig({
  plugins: [react()],
  resolve: {
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
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/__tests__/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.next/**", "**/e2e/**"],
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5432/ci",
      DIRECT_URL:
        process.env.DIRECT_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5432/ci",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ??
        "test-better-auth-secret-at-least-32-characters",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
    },
  },
});
