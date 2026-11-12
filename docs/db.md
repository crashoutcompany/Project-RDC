# Database Reset & Migration Guide

## Exporting Sessions

1. Grab all sessions, conforming to the `EnrichedSession` type.
2. Save them as a JSON file for use in the seed script.

## Migrations

Schema history lives in `prisma/migrations`. `0_init` is the baseline of the schema as it was when migrations were adopted; every later change is a new migration.

### Creating a migration

Against a **local** database only (set `DIRECT_URL` to a localhost Postgres):

```bash
pnpm prisma migrate dev --name <name-of-migration>
```

Review the generated SQL, commit it with the `schema.prisma` change. If prompted to reset, that is fine locally (`pnpm prisma migrate reset` also reseeds). Never run `migrate dev` or `migrate reset` against a Neon or production database.

### Applying migrations

```bash
pnpm prisma migrate deploy
```

`pnpm db:migrate:ci` does the same, but first marks `0_init` as applied if the database was created by `prisma db push` (tables exist, no `_prisma_migrations`). CI runs it on throwaway Postgres to check the migrations, and checks they match `schema.prisma`.

### One-time baseline of an existing database

Databases created with `db push` (production, the Neon CI parent branch) must be told `0_init` is already applied. Take a Neon branch snapshot first, then:

```bash
pnpm prisma migrate status
pnpm prisma migrate resolve --applied 0_init
pnpm prisma migrate deploy
pnpm prisma migrate status
```

### TypedSQL

`postinstall` only runs `prisma generate`. TypedSQL types (`prisma/sql`) are generated with `pnpm generate:sql`, which needs a database matching the schema; `pnpm build` and `pnpm build:e2e` run it first. Run it yourself before `pnpm typecheck` on a fresh checkout.

## Resetting a local database

```bash
pnpm dbcrashout
```

This force-resets the database in `DIRECT_URL` with `db push` and runs `prisma/seed.ts`. It refuses to run unless the host is `localhost`/`127.0.0.1`; set `DBCRASHOUT_I_KNOW=1` to override (this destroys all data).

## Importing Sessions

Be sure to update the seed script to point to the JSON file where you have all the sessions stored, so they can be imported back into the database.
