import { config } from "dotenv";

/**
 * Loads the same env files Next reads in development (first match wins), so
 * model API keys set up for `pnpm dev` work in `harvest extract` too. Never
 * overrides what is already in the environment, so `--env-file` values win.
 */
export const loadAppEnv = (): void => {
  config({
    path: [".env.development.local", ".env.local", ".env"],
    quiet: true,
  });
};
