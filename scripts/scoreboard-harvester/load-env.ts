import { config } from "dotenv";

// Same files Next reads in development (first match wins), so model API keys
// set up for `pnpm dev` work here too. Imported first by index.ts.
config({
  path: [".env.development.local", ".env.local", ".env"],
  quiet: true,
});
