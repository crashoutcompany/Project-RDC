export const APP_NAME = "Project RDC";
export const SIGN_IN_PATH = "/signin";

export type SocialProvider = "github" | "google";

export const AUTH_ORIGINS = {
  local: "http://localhost:3000",
  production: "https://rdcstats.com",
  productionWww: "https://www.rdcstats.com",
  vercelProject: "https://project-rdc.vercel.app",
} as const;

export const PRODUCTION_URL = AUTH_ORIGINS.production;

export const TEST_AUTH_USER = {
  id: "project-rdc-e2e-tester",
  name: "Project RDC E2E Tester",
  email: "e2e-tester@rdcstats.test",
  role: "admin",
} as const;

/**
 * `input: false` keeps `role` server-assigned. Better Auth's
 * POST /api/auth/update-user otherwise persists whatever the client sends.
 */
export const userAdditionalFields = {
  role: {
    type: "string",
    required: false,
    defaultValue: "user",
    input: false,
  },
} as const;
