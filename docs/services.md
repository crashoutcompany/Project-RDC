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

#### Neon Branch Auto-Switching

The project includes automatic database branch switching when you change git branches. This integrates with the GitHub workflow that creates Neon preview branches for each pull request.

**How it works**:

1. When you checkout a git branch, the `post-checkout` hook runs automatically
2. The script looks for a matching Neon branch with the pattern `preview/pr-{number}-{branch_name}`
3. If found, it updates `DATABASE_URL` and `DIRECT_URL` in `.env.development.local`
4. If no matching branch exists, the current URLs are preserved

**Requirements**:

- `NEON_PROJECT_ID` - Your Neon project ID (or add `projectId` to `.neon` file)
- `neonctl` authentication - Run `neonctl auth` once to authenticate

**Setup**:

1. Authenticate with Neon CLI (one-time):
   ```bash
   npx neonctl auth
   ```
2. Set the project ID via environment variable:
   ```bash
   export NEON_PROJECT_ID="your_project_id"
   ```
3. Or add `projectId` to your `.neon` config file:
   ```json
   {
     "orgId": "your_org_id",
     "projectId": "your_project_id"
   }
   ```

**Manual Usage**:

```bash
pnpm update-neon-branch
```

**Troubleshooting**:

- If the hook doesn't run, ensure Husky is installed: `pnpm prepare`
- If authentication fails, run `pnpm exec neonctl auth` to re-authenticate
- Verify the Neon branch exists in the [Neon Console](https://console.neon.tech)

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

### Better Auth

**Website**: [https://www.better-auth.com](https://www.better-auth.com)
**Documentation**: [https://www.better-auth.com/docs](https://www.better-auth.com/docs)

**Purpose**: Self-hosted authentication for the Next.js application.

**Providers Used**:

- GitHub OAuth
- Google OAuth
- Email one-time code, restricted to an allowlist (for bot/automation accounts)

**Environment Variables**:

- `AUTH_GITHUB_ID` - GitHub OAuth App Client ID
- `AUTH_GITHUB_SECRET` - GitHub OAuth App Client Secret
- `AUTH_GOOGLE_ID` - Google OAuth Client ID
- `AUTH_GOOGLE_SECRET` - Google OAuth Client Secret
- `AUTH_OTP_ALLOWED_EMAILS` - Optional comma-separated allowlist for email-code sign-in
- `AUTH_EMAIL_FROM` - Sender for sign-in codes (must be on a Resend-verified domain)
- `UPSTASH_REDIS_REST_URL` - Optional Upstash Redis REST URL for shared auth rate limits (memory is used unless a complete URL and token pair is set)
- `UPSTASH_REDIS_REST_TOKEN` - Optional Upstash Redis REST token, paired with the URL
- `KV_REST_API_URL` - Optional fallback to the Vercel Upstash integration's URL name, read when the `UPSTASH_REDIS_REST_*` pair is unset
- `KV_REST_API_TOKEN` - Optional fallback token name, paired with `KV_REST_API_URL`
- `AUTH_RATE_LIMIT_PREFIX` - Optional key namespace for rate limits; defaults to `<app slug>:<VERCEL_ENV or NODE_ENV>` (`project-rdc:production`, `project-rdc:preview`, or `project-rdc:development`). Set a value that differs per environment when one Upstash database is shared
- `BETTER_AUTH_SECRET` - Secret used to sign and encrypt auth data
- `BETTER_AUTH_URL` - Optional canonical auth origin
- `TEST_AUTH_SECRET` - Shared secret for the local authenticated E2E login
- `EXPOSE_TESTING_API` - Set to `1` only for local/CI E2E builds
- `PLAYWRIGHT_BASE_URL` - Optional Playwright target URL

**Usage**:

- Configuration in `src/lib/auth.ts`
- App-specific auth constants in `src/lib/auth/config.ts`
- Sign-in page at `/signin`
- Admin access requires a Better Auth session with the `admin` role
- Test login endpoint at `/api/test-auth/login` is disabled on Vercel and
  production deployments
- Email-code sign-in (`src/lib/auth/email-otp.ts`) is registered only when
  `AUTH_OTP_ALLOWED_EMAILS`, `AUTH_EMAIL_FROM` and `RESEND_API_KEY` are all set.
  Codes are only ever sent for the `sign-in` type and only to listed addresses.
  An unlisted address, or a blocked one (see the admin guard), gets the same
  `{ success: true }` response but no code is stored and no email is sent.
  Emails are trimmed and lowercased everywhere. Codes are 6 digits, expire after
  5 minutes, and allow 3 attempts. New accounts get the `user` role.
- Disabled routes: when email OTP is configured, the non-sign-in OTP routes
  (`/email-otp/reset-password`, `/email-otp/verify-email`,
  `/email-otp/check-verification-otp`, `/email-otp/request-password-reset`,
  `/forget-password/email-otp`, `/email-otp/request-email-change`,
  `/email-otp/change-email`) are listed in Better Auth `disabledPaths`, so they
  are not served. Code sign-in is the only OTP flow.
- Failed sign-in codes all return the same `400` with `INVALID_OTP`, whether the
  code is wrong, expired, out of attempts, malformed, or the address is unlisted
  or blocked, so the response does not reveal whether an account exists.
- Admin guard (`src/lib/auth/otp-admin-guard.ts`): email-code sign-in and send
  are refused for admins and for any user who already has a linked OAuth or
  password account, even if the address is listed. The user is found by email,
  then accounts are loaded by `userId`. A failed lookup is retried once. If the
  retry also fails, the guard logs `otp_guard_lookup_failed` with the attempt
  count, the hashed email, and the error name and message (the address is
  replaced with `[redacted]`). It then answers like an unlisted address: sign-in
  returns the same `400 INVALID_OTP` as a wrong code, and send returns
  `{ success: true }` with no code stored or emailed. Blocked attempts are logged
  as `otp_sign_in_failed` with `reason: otp_account_blocked`. On send, a blocked
  address gets the same `{ success: true }` response as an unlisted one. Listed
  addresses should still be bot inboxes that should never be admins.
- OTP failure logs: each failure logs `otp_sign_in_failed` with a `reason`
  (`otp_expired`, `otp_too_many_attempts`, `otp_invalid`, `otp_unlisted`,
  `otp_account_blocked`) and `emailHash`, never the raw address. The hash is the
  first 16 hex characters of HMAC-SHA256 over the normalized email, keyed with
  `BETTER_AUTH_SECRET`, so logs can group attempts on one address without
  storing it.
- Delivery failures: if Resend rejects a code email, the error is logged as
  `[auth] sign-in code email failed` and is not shown to the user. The user sees
  the same success response as an unlisted address.
- Rate limiting (`src/lib/auth/rate-limit.ts`, shared between apps, wired in
  `src/lib/auth/create-auth.ts`): two layers share one store.
  - Per-IP limits are Better Auth's defaults for sign-in, sign-up and email-code
    routes. They are enforced only when `NODE_ENV=production` (Vercel production
    and preview, and `next start` in CI), and are off in dev and unit tests.
  - Per-email lockout on the email-code routes counts every address, listed or
    not, so the response does not reveal the allowlist. Two counters run for
    every request, over 15 minutes: per email and client IP (5 code sends, 10
    sign-in attempts) and per email from any IP (20 sends, 30 sign-in attempts).
    Unresolvable IPs share one `unknown` bucket. Over the send limit, the route
    returns the normal `{ success: true }` response and sends nothing. Over the
    sign-in limit, it returns `429 TOO_MANY_REQUESTS` with a `Retry-After`
    header in seconds, after the CSRF check. Storage keys are HMAC-SHA256 digests
    keyed with `BETTER_AUTH_SECRET`, so no raw email or IP is stored.
  - Storage is Upstash Redis when a complete pair is set, either
    `UPSTASH_REDIS_REST_URL` with `UPSTASH_REDIS_REST_TOKEN`, or
    `KV_REST_API_URL` with `KV_REST_API_TOKEN`. The two pairs are not mixed, and
    `UPSTASH_*` wins when both are complete. Otherwise it is memory, per server
    instance. Redis calls are not retried, so a timed-out call that falls back to
    memory cannot count twice. If a Redis call errors or takes over 1 second, that
    call falls back to memory and logs `auth_rate_limit_redis_unavailable` (at
    most once a minute, with the reason and error name only).
  - `AUTH_RATE_LIMIT_PREFIX` namespaces the keys. When unset, the prefix is
    `<app slug>:<VERCEL_ENV or NODE_ENV>`, where the app slug is `project-rdc`.
    Set it to a value that differs per environment when one Upstash database is
    shared, so a preview or local run cannot lock out production.

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
- `AUTH_EMAIL_FROM` - Sender for email sign-in codes; must use a verified domain

**Usage**:

- Feedback email notifications in `src/app/api/feedback/route.ts`
- Weekly feedback summary emails sent via cron job
- Email sign-in codes for allowlisted accounts (`src/lib/auth/email-otp.ts`)
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
4. **Authentication**: Admin access is role-gated in `src/lib/auth.ts` and `src/proxy.ts`
5. **Billing**: Monitor usage in each service's dashboard to track costs and usage limits
