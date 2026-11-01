import { config } from "dotenv";

/**
 * Imported first by index.ts, for its side effect. `extract` loads the same env
 * files Next reads in development (first match wins), so model API keys set up
 * for `pnpm dev` work here too. It must run before index.ts's other imports:
 * they reach `prisma/db` (via `@/lib/constants`), which builds the Prisma client
 * from DATABASE_URL as soon as it loads, and without one it connects to
 * localhost.
 *
 * `weekly` writes to a database, so it only gets what --env-file gave it: a
 * missing DATABASE_URL must fail, not fall back to dev. Never overrides what is
 * already in the environment, so `--env-file` values win.
 */
if (!process.argv.slice(2).includes("weekly"))
  config({
    path: [".env.development.local", ".env.local", ".env"],
    quiet: true,
  });
