# Repository Setup Instructions

Follow these steps to set up the necessary environment variables for this repository.

## Environment Variables

This project requires three different environment files to be set up:

-   `.env`
-   `.env.development.local`
-   `.env.production.local`

### `.env`

This file is primarily used by Prisma and for the static site generation (SSG) build process. It should contain the following variables:

```bash
DATABASE_URL="your_database_url"
DIRECT_URL="your_direct_database_url"
NEXT_PUBLIC_POSTHOG_KEY="your_posthog_key"
NEXT_PUBLIC_POSTHOG_HOST="your_posthog_host"
```

**Important:** When debugging a local build, ensure the `DATABASE_URL` in this file matches the one in `.env.development.local`.

### `.env.development.local`

This file is used when running the application in development mode with `npm run dev`. It should contain all the necessary environment variables for full functionality.

```bash
# Add all required environment variables here
# Example:
# DATABASE_URL="your_dev_database_url"
# ... other variables
```

### `.env.production.local`

This file is used for production builds and when running the application with `npm run start`. The build process will load variables from both `.env` and `.env.production.local`, with variables in `.env.production.local` taking precedence.

```bash
# Add all required environment variables here
# Example:
# DATABASE_URL="your_prod_database_url"
# ... other variables
```

## Git Hooks (Husky)

This project uses [Husky](https://typicode.github.io/husky/) for Git hooks. Hooks are automatically installed when you run `npm install` via the `prepare` script.

**Note:** The `prepare` script checks for the `CI` environment variable and skips Husky installation in CI/deployment environments (like GitHub Actions and Vercel).

### Available Hooks

- **post-checkout**: Automatically switches Neon database branches when you checkout a git branch (see below)

## Neon Database Branch Switching

The project automatically switches your local database connection to match Neon preview branches when you checkout git branches.

### Setup

1. **Authenticate with Neon CLI** (one-time):

   ```bash
   npx neonctl auth
   ```

2. **Configure Project ID** - Add `projectId` to your `.neon` file:

   ```json
   {
     "orgId": "your_org_id",
     "projectId": "your_project_id"
   }
   ```

   You can find your project ID in the [Neon Console](https://console.neon.tech) URL or by running `npx neonctl projects list`.

### How It Works

When you checkout a branch that has a corresponding Neon preview branch (created by PR workflows), the script:

1. Detects your current git branch
2. Finds the matching Neon branch (`preview/pr-{number}-{branch_name}`)
3. Updates `DATABASE_URL` and `DIRECT_URL` in `.env.development.local`

### Manual Usage

To manually trigger the database branch switch:

```bash
npm run update-neon-branch
```

### Logs

Branch switches are logged to `.neon-switch.log` (last 50 entries). This file is gitignored.