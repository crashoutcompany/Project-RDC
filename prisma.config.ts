import path from "node:path";
import { defineConfig, env } from "prisma/config";
import "dotenv/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },

  /** CLI/TypedSQL datasource — uses DIRECT_URL from `.env` (not DATABASE_URL). */
  datasource: { url: env("DIRECT_URL") },
  typedSql: { path: "./prisma/sql" },
});
