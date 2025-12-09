# Project RDC - Services Documentation

This document provides an overview of all external services used in Project RDC, including links to their dashboards, documentation, and configuration details.

## Database

### Neon (PostgreSQL)

**Website**: [https://neon.tech](https://neon.tech)  
**Dashboard**: [https://console.neon.tech](https://console.neon.tech)  
**Documentation**: [https://neon.tech/docs](https://neon.tech/docs)

**Purpose**: Serverless PostgreSQL database hosting for the application.

**Environment Variables**:

- `DATABASE_URL` - Connection string for the database
- `DIRECT_URL` - Direct connection URL (used for migrations)

**Usage**:

- Database operations via Prisma ORM
- Located in `prisma/db.ts`
- Schema defined in `prisma/schema.prisma`

---

## Hosting & Deployment

### Vercel

**Website**: [https://vercel.com](https://vercel.com)  
**Dashboard**: [https://vercel.com/dashboard](https://vercel.com/dashboard)  
**Documentation**: [https://vercel.com/docs](https://vercel.com/docs)

**Purpose**: Hosting and deployment platform for the Next.js application.

**Configuration**:

- Cron jobs configured in `vercel.json`
- Automatic deployments from Git

**Cron Jobs**:

- `/api/sheets` - Runs weekly (Mondays at 10:00 AM)
- `/api/edit-sessions` - Runs weekly (Mondays at 10:00 AM)

---

## Authentication

### NextAuth.js

**Website**: [https://next-auth.js.org](https://next-auth.js.org)  
**Documentation**: [https://next-auth.js.org/getting-started/introduction](https://next-auth.js.org/getting-started/introduction)

**Purpose**: Authentication framework for Next.js applications.

**Providers Used**:

- GitHub OAuth
- Google OAuth

**Environment Variables**:

- `AUTH_GITHUB_ID` - GitHub OAuth App Client ID
- `AUTH_GITHUB_SECRET` - GitHub OAuth App Client Secret
- `AUTH_GOOGLE_ID` - Google OAuth Client ID
- `AUTH_GOOGLE_SECRET` - Google OAuth Client Secret
- `AUTH_SECRET` - Secret key for JWT encryption
- `AUTH_TRUST_HOST` - Trust host configuration

**Usage**:

- Configuration in `src/auth.ts`
- Sign-in page at `/signin`
- Admin access restricted to specific users

**OAuth Provider Links**:

- **GitHub**: [https://github.com/settings/developers](https://github.com/settings/developers)
- **Google Cloud Console**: [https://console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)

---

## Analytics

### PostHog

**Website**: [https://posthog.com](https://posthog.com)  
**Dashboard**: [https://app.posthog.com](https://app.posthog.com)  
**Documentation**: [https://posthog.com/docs](https://posthog.com/docs)

**Purpose**: Product analytics and feature flags for tracking user behavior and application metrics.

**Environment Variables**:

- `NEXT_PUBLIC_POSTHOG_KEY` - PostHog project API key
- `NEXT_PUBLIC_POSTHOG_HOST` - PostHog instance host URL

**Usage**:

- Client-side initialization in `src/posthog/client-init.tsx`
- Server-side initialization in `src/posthog/server-init.tsx`
- Event tracking in `src/posthog/events.ts`
- AI tracing integration with `@posthog/ai`

---

## AI Services

### Google Generative AI (Gemini)

**Website**: [https://ai.google.dev](https://ai.google.dev)  
**Documentation**: [https://ai.google.dev/docs](https://ai.google.dev/docs)  
**Console**: [https://console.cloud.google.com/vertex-ai](https://console.cloud.google.com/vertex-ai)
**AI Studio**: [AI Studio, API Keys come from here](https://aistudio.google.com)

**Purpose**: AI text generation and processing using Google's Gemini models.

**Environment Variables**:

- `GOOGLE_GENERATIVE_AI_API_KEY` - Google Generative AI API key

**Usage**:

- AI actions in `src/app/ai/actions.ts`
- Text generation via `@ai-sdk/google` package
- Used for processing game session data and summaries

---

### Azure Document Intelligence

**Website**: [https://azure.microsoft.com/en-us/products/ai-services/document-intelligence](https://azure.microsoft.com/en-us/products/ai-services/document-intelligence)  
**Documentation**: [https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence)  
**Portal**: [https://portal.azure.com](https://portal.azure.com)

**Purpose**: Extract text and data from documents and images (OCR and document analysis).

**Environment Variables**:

- `DOCUMENT_INTELLIGENCE_ENDPOINT` - Azure Document Intelligence endpoint URL
- `DOCUMENT_INTELLIGENCE_API_KEY` - Azure Document Intelligence API key

**Usage**:

- Document processing in `src/app/actions/visionAction.ts`
- Used for extracting game session data from uploaded images/documents

---

### Azure Vision Image Analysis

**Website**: [https://azure.microsoft.com/en-us/products/ai-services/computer-vision](https://azure.microsoft.com/en-us/products/ai-services/computer-vision)  
**Documentation**: [https://learn.microsoft.com/en-us/azure/ai-services/computer-vision](https://learn.microsoft.com/en-us/azure/ai-services/computer-vision)  
**Portal**: [https://portal.azure.com](https://portal.azure.com)

**Purpose**: Image analysis and computer vision capabilities.

**Usage**:

- Image analysis via `@azure-rest/ai-vision-image-analysis` package
- Used alongside Document Intelligence for processing game session screenshots

---

## Email Services

### Resend

**Website**: [https://resend.com](https://resend.com)  
**Dashboard**: [https://resend.com/emails](https://resend.com/emails)  
**Documentation**: [https://resend.com/docs](https://resend.com/docs)

**Purpose**: Email delivery service for sending transactional emails.

**Environment Variables**:

- `RESEND_API_KEY` - Resend API key
- `RESEND_JOB_SEND_LIST` - Semicolon-separated list of email recipients for cron jobs

**Usage**:

- Feedback email notifications in `src/app/api/feedback/route.ts`
- Weekly feedback summary emails sent via cron job
- Email template component in `src/components/email-template.tsx`

---

## Google Services

### Google Sheets API

**Website**: [https://developers.google.com/sheets/api](https://developers.google.com/sheets/api)  
**Documentation**: [https://developers.google.com/sheets/api/guides/concepts](https://developers.google.com/sheets/api/guides/concepts)  
**Console**: [https://console.cloud.google.com/apis/library/sheets.googleapis.com](https://console.cloud.google.com/apis/library/sheets.googleapis.com)

**Purpose**: Read and write data from Google Sheets for game session data management.

**Environment Variables**:

- `SHEET_ID` - Google Sheets document ID
- `GCP_SA_KEY` - Base64-encoded Google Cloud service account JSON key

**Usage**:

- Sheet data processing in `src/app/api/sheets/route.ts`
- Service account authentication for server-to-server access
- Weekly cron job to process sheet data

**Setup**:

- Requires Google Cloud service account with Sheets API enabled
- Service account key must be base64-encoded and stored in `GCP_SA_KEY`

---

### YouTube API

**Website**: [https://developers.google.com/youtube](https://developers.google.com/youtube)  
**Documentation**: [https://developers.google.com/youtube/v3](https://developers.google.com/youtube/v3)  
**Console**: [https://console.cloud.google.com/apis/library/youtube.googleapis.com](https://console.cloud.google.com/apis/library/youtube.googleapis.com)

**Purpose**: YouTube video data retrieval and processing.

**Environment Variables**:

- `YOUTUBE_API_KEY` - YouTube Data API v3 key

**Usage**:

- Video ID extraction utilities
- Used in admin workflows for processing game session data

---

## Development Tools

### CodeRabbit

**Website**: [https://coderabbit.ai](https://coderabbit.ai)  
**Documentation**: [https://docs.coderabbit.ai](https://docs.coderabbit.ai)

**Purpose**: AI-powered code review and pull request analysis.

**Configuration**:

- Configuration file: `coderabbit.yaml`
- Automated code reviews on pull requests

---

## Service Status & Monitoring

For checking service status and outages:

- **Vercel Status**: [https://www.vercel-status.com](https://www.vercel-status.com)
- **Neon Status**: [https://status.neon.tech](https://status.neon.tech)
- **Azure Status**: [https://status.azure.com](https://status.azure.com)
- **Google Cloud Status**: [https://status.cloud.google.com](https://status.cloud.google.com)
- **PostHog Status**: [https://status.posthog.com](https://status.posthog.com)

---

## Environment Variables Summary

All environment variables are managed in:

- `.env` - Used by Prisma and SSG builds
- `.env.development.local` - Development environment
- `.env.production.local` - Production environment

See `docs/setup.md` for detailed environment variable setup instructions.

---

## Notes for Maintainers

1. **API Keys**: All API keys should be stored securely and never committed to version control
2. **Service Accounts**: Google Cloud service account keys are base64-encoded in environment variables
3. **Cron Jobs**: Weekly cron jobs run on Mondays at 10:00 AM UTC
4. **Authentication**: Admin access is currently restricted to specific GitHub/Google accounts (see `src/auth.ts`)
5. **Billing**: Monitor usage in each service's dashboard to track costs and usage limits
