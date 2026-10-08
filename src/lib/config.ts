import "server-only";

interface Config {
  YOUTUBE_API_KEY: string | undefined;
  NEXT_PUBLIC_POSTHOG_KEY: string | undefined;
  NEXT_PUBLIC_POSTHOG_HOST: string | undefined;
  DOCUMENT_INTELLIGENCE_ENDPOINT: string | undefined;
  DOCUMENT_INTELLIGENCE_API_KEY: string | undefined;
  SHEET_ID: string | undefined;
  GCP_SA_KEY: string | undefined;
  CRON_SECRET: string | undefined;
  RESEND_API_KEY: string | undefined;
  RESEND_JOB_SEND_LIST?: string | undefined;
}

const config: Config = {
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  DOCUMENT_INTELLIGENCE_ENDPOINT: process.env.DOCUMENT_INTELLIGENCE_ENDPOINT,
  DOCUMENT_INTELLIGENCE_API_KEY: process.env.DOCUMENT_INTELLIGENCE_API_KEY,
  SHEET_ID: process.env.SHEET_ID,
  GCP_SA_KEY: process.env.GCP_SA_KEY,
  CRON_SECRET: process.env.CRON_SECRET,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  RESEND_JOB_SEND_LIST: process.env.RESEND_JOB_SEND_LIST,
};

export default config;
