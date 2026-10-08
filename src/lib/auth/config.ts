export const APP_NAME = "Project RDC";
export const SIGN_IN_PATH = "/signin";

export type SocialProvider = "github" | "google";

export const AUTH_ORIGINS = {
  local: "http://localhost:3000",
  production: "https://rdcstats.com",
  productionWww: "https://www.rdcstats.com",
  vercelProject: "https://project-rdc.vercel.app",
  vercelPreviewWildcard: "https://*.vercel.app",
} as const;

export const PRODUCTION_URL = AUTH_ORIGINS.production;
export const PREVIEW_ORIGIN = AUTH_ORIGINS.vercelPreviewWildcard;

export const TEST_AUTH_USER = {
  id: "project-rdc-e2e-tester",
  name: "Project RDC E2E Tester",
  email: "e2e-tester@rdcstats.test",
  role: "admin",
} as const;
