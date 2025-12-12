import path from "node:path";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 configuration file.
 * Defines database connection URLs for migrations and schema operations.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },

  /**
   * Datasource configuration for TypedSQL and CLI operations.
   * Uses .env file in the project root for DATABASE_URL.
   * @see https://pris.ly/d/config-datasource
   */
  datasource: { url: env("DIRECT_URL") },
  typedSql: { path: "./prisma/sql" },
});
