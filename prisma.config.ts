import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 configuration file.
 * Defines database connection URLs for migrations and schema operations.
 */
export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),

  /**
   * Datasource configuration for TypedSQL and CLI operations.
   * Uses .env file in the project root for DATABASE_URL.
   * @see https://pris.ly/d/config-datasource
   */
  datasource: {
    // sourceFilePath is a valid runtime property but not in types yet
    sourceFilePath: path.join(__dirname, ".env"),
  } as unknown as { url: string },

  /**
   * TypedSQL configuration - path to SQL query files.
   */
  typedSql: {
    path: path.join(__dirname, "prisma", "sql"),
  },
});
