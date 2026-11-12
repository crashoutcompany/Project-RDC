/**
 * Wipes the database in DIRECT_URL (`db push --force-reset`) and reseeds it.
 * Refuses to run unless the host is local, or DBCRASHOUT_I_KNOW=1 is set.
 */
import "dotenv/config";
import { spawnSync } from "node:child_process";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("dbcrashout: DIRECT_URL (or DATABASE_URL) is not set.");
  process.exit(1);
}

let host: string;
try {
  host = new URL(url).hostname;
} catch {
  console.error("dbcrashout: could not parse the database URL.");
  process.exit(1);
}

const isLocal = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
if (!isLocal && process.env.DBCRASHOUT_I_KNOW !== "1") {
  console.error(
    `dbcrashout: refusing to wipe non-local database host "${host}".\n` +
      "This command drops every table. If you really mean it, re-run with DBCRASHOUT_I_KNOW=1.",
  );
  process.exit(1);
}

for (const args of [
  ["prisma", "db", "push", "--force-reset"],
  ["prisma", "db", "push"],
  ["tsx", "prisma/seed.ts"],
]) {
  const res = spawnSync("npx", args, { stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}
