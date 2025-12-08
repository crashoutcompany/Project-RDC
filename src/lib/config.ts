import "server-only"; // Keep in sync with .env
interface Config {
  DATABASE_URL: string | undefined;
  DIRECT_URL: string | undefined;
  YOUTUBE_API_KEY: string | undefined;
  NEXT_PUBLIC_POSTHOG_KEY: string | undefined;
  NEXT_PUBLIC_POSTHOG_HOST: string | undefined;
  AUTH_GITHUB_ID: string | undefined;
  AUTH_GITHUB_SECRET: string | undefined;
  AUTH_TRUST_HOST: string | undefined;
  AUTH_SECRET: string | undefined;
  NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_ENDPOINT: string | undefined;
  NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_API_KEY: string | undefined;
  NEXT_PUBLIC_APP_URL: string | undefined;
  AUTH_GOOGLE_ID: string | undefined;
  AUTH_GOOGLE_SECRET: string | undefined;
  GOOGLE_GENERATIVE_AI_API_KEY: string | undefined;
  SHEET_ID: string | undefined;
  GCP_SA_KEY: string | undefined;
  CRON_SECRET: string | undefined;
  RESEND_API_KEY: string | undefined;
  RESEND_JOB_SEND_LIST?: string | undefined;
}

const getConfig = (): Config => {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    AUTH_GITHUB_ID: process.env.AUTH_GITHUB_ID,
    AUTH_GITHUB_SECRET: process.env.AUTH_GITHUB_SECRET,
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST,
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_ENDPOINT:
      process.env.DOCUMENT_INTELLIGENCE_ENDPOINT,
    NEXT_PUBLIC_DOCUMENT_INTELLIGENCE_API_KEY:
      process.env.DOCUMENT_INTELLIGENCE_API_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID,
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    SHEET_ID: process.env.SHEET_ID,
    GCP_SA_KEY: process.env.GCP_SA_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_JOB_SEND_LIST: process.env.RESEND_JOB_SEND_LIST,
  };
};

const getSanitizedConfig = (
  config: Config,
): { [key in keyof typeof config]: string } => {
  for (const [] of Object.entries(config)) {
    // if (val === undefined && window === undefined) {
    //   throw new Error(`Missing key ${key} in .env`);
    // }
  }
  const c = { ...config } as unknown;
  return c as { [key in keyof typeof config]: string };
};

const config = getConfig();
const sanitizedConfig = getSanitizedConfig(config);

export default sanitizedConfig;
