#!/usr/bin/env tsx
/**
 * Point the local database env vars in .env.development.local at the Neon preview
 * branch for the current git branch, and put the original values back when you leave it.
 *
 * Triggered by the git post-checkout hook via Husky. Run manually with
 * `pnpm update-neon-branch --force` (e.g. after opening the PR). Set SKIP_NEON_SWITCH=1
 * to disable.
 *
 * The post-merge hook runs it with `--if-preview`: when you're on a preview branch it
 * re-checks that the preview still exists (the workflow deletes it when the PR closes)
 * and restores the original URLs if not. It does nothing otherwise.
 *
 * Preview branches are created by the shared crashoutcompany neon-branches workflow
 * as `preview/pr-{number}-{head ref with "/" replaced by "-"}`.
 *
 * @requires NEON_PROJECT_ID environment variable (or projectId in .neon file)
 * @requires neonctl authentication (run `pnpm exec neonctl auth`)
 */

import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

/** Env var → which Neon connection string it gets. */
const ENV_VARS: Record<string, "pooled" | "direct"> = {
  DATABASE_URL: "pooled",
  DIRECT_URL: "direct",
};

const ENV_FILE = ".env.development.local";
const NEON_CONFIG_FILE = ".neon";
/** Holds the pre-preview env values (secrets) — gitignored. */
const STATE_FILE = ".neon-switch.json";
const LOG_FILE = ".neon-switch.log";
const MAX_LOG_ENTRIES = 50;
/** neonctl waits for a browser login when unauthenticated; never block a checkout on it. */
const COMMAND_TIMEOUT_MS = 15_000;

type State = {
  /** Git branch the last completed run handled. */
  gitBranch?: string;
  /** Neon branch currently written to ENV_FILE, if any. */
  activeNeonBranch?: string;
  /** Raw values from before the switch; null = key was absent. */
  base?: Record<string, string | null>;
  /** ENV_FILE didn't exist before the switch. */
  createdEnvFile?: boolean;
};

const cwd = process.cwd();

/** Run without a shell so branch names are never interpreted. */
function run(file: string, args: string[]): string | null {
  try {
    return execFileSync(file, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: COMMAND_TIMEOUT_MS,
    }).trim();
  } catch {
    return null;
  }
}

function neonctl(args: string[]): string | null {
  const local = path.join(cwd, "node_modules", ".bin", "neonctl");
  return run(fs.existsSync(local) ? local : "neonctl", args);
}

/** Current branch name, or null when HEAD is detached (rebase, bisect, tag checkout). */
function getCurrentBranch(): string | null {
  return run("git", ["symbolic-ref", "--short", "-q", "HEAD"]) || null;
}

function getProjectId(): string | null {
  if (process.env.NEON_PROJECT_ID) return process.env.NEON_PROJECT_ID;

  const neonConfigPath = path.join(cwd, NEON_CONFIG_FILE);
  if (fs.existsSync(neonConfigPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(neonConfigPath, "utf8"));
      if (config.projectId) return config.projectId;
    } catch {
      console.warn("Failed to parse .neon config file");
    }
  }

  return null;
}

/**
 * Neon `preview/pr-{n}-{gitBranch with / → -}` matching the git branch.
 * `undefined` = lookup failed (network, auth, timeout); `null` = no preview branch.
 */
function findNeonBranch(
  projectId: string,
  gitBranch: string,
): string | null | undefined {
  const output = neonctl([
    "branches",
    "list",
    "--project-id",
    projectId,
    "--output",
    "json",
  ]);
  if (!output) {
    console.log("Failed to list Neon branches (is neonctl authenticated?)");
    return undefined;
  }

  let branches: { name: string }[];
  try {
    branches = JSON.parse(output);
  } catch {
    console.log("Failed to parse Neon branches response");
    return undefined;
  }

  // Mirrors the workflow's `${HEAD_REF//\//-}`.
  const safeRef = gitBranch.replaceAll("/", "-");
  const pattern = new RegExp(`^preview/pr-(\\d+)-${escapeRegExp(safeRef)}$`);

  // A reused branch name can have several PRs; prefer the newest.
  let best: { name: string; pr: number } | null = null;
  for (const branch of branches) {
    const match = pattern.exec(branch.name);
    if (match && (!best || Number(match[1]) > best.pr))
      best = { name: branch.name, pr: Number(match[1]) };
  }
  return best?.name ?? null;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse `@ep-{a}-{b}-…` from a connection string → `{a}-{b}`. */
function extractEndpointName(connectionString: string): string {
  const match = connectionString.match(/@ep-([a-z]+)-([a-z]+)-/i);
  if (match) return `${match[1]}-${match[2]}`;
  return "unknown";
}

/** Write via temp file + rename so an interrupted run can't truncate the target. */
function writeFileAtomic(filePath: string, content: string, mode?: number) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, { mode });
  fs.renameSync(tmp, filePath);
}

function readState(): State {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, STATE_FILE), "utf8"));
  } catch {
    return {};
  }
}

function writeState(state: State): void {
  writeFileAtomic(
    path.join(cwd, STATE_FILE),
    JSON.stringify(state, null, 2) + "\n",
    0o600,
  );
}

/** Append a switch entry; keep the last MAX_LOG_ENTRIES. */
function writeLog(message: string): void {
  const logPath = path.join(cwd, LOG_FILE);
  const logEntry = `[${new Date().toISOString()}] ${message}`;

  let entries: string[] = [];
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, "utf8");
    entries = content.split("\n").filter((line) => line.trim() !== "");
  }

  entries.push(logEntry);
  if (entries.length > MAX_LOG_ENTRIES)
    entries = entries.slice(-MAX_LOG_ENTRIES);

  fs.writeFileSync(logPath, entries.join("\n") + "\n");
}

function getConnectionString(
  projectId: string,
  branchName: string,
  pooled: boolean,
): string | null {
  // neonctl >=8 takes the branch positionally; an unknown --branch flag is ignored
  // and silently yields the default branch.
  const args = ["connection-string", branchName, "--project-id", projectId];
  if (pooled) args.push("--pooled");

  const connectionString = neonctl(args);
  if (!connectionString) {
    console.log(
      `Failed to get ${pooled ? "pooled" : "direct"} connection string`,
    );
    return null;
  }

  return connectionString;
}

function readEnvFile(): string | null {
  const envPath = path.join(cwd, ENV_FILE);
  return fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : null;
}

function keyPattern(key: string): RegExp {
  return new RegExp(`^${key}=(.*)$`, "m");
}

/** Raw right-hand side of `KEY=…`, or null if absent. */
function getEnvValue(content: string, key: string): string | null {
  return keyPattern(key).exec(content)?.[1] ?? null;
}

/** Set `KEY=raw`, or remove the line when raw is null. */
function setEnvValue(content: string, key: string, raw: string | null) {
  const pattern = keyPattern(key);
  if (raw === null)
    return content.replace(new RegExp(`${pattern.source}\\n?`, "m"), "");
  // Replacer function: connection strings may contain `$&`-style sequences.
  if (pattern.test(content))
    return content.replace(pattern, () => `${key}=${raw}`);
  return `${content}${content && !content.endsWith("\n") ? "\n" : ""}${key}=${raw}\n`;
}

function writeEnvFile(content: string): void {
  writeFileAtomic(path.join(cwd, ENV_FILE), content);
}

/** Put back the values from before the preview switch. */
function restoreBase(state: State): void {
  let content = readEnvFile() ?? "";
  for (const [key, raw] of Object.entries(state.base ?? {}))
    content = setEnvValue(content, key, raw);

  if (state.createdEnvFile && content.trim() === "")
    fs.rmSync(path.join(cwd, ENV_FILE), { force: true });
  else writeEnvFile(content);

  console.log(`Restored original ${Object.keys(ENV_VARS).join(" / ")}`);
}

async function main(): Promise<void> {
  if (process.env.SKIP_NEON_SWITCH) return;

  const gitBranch = getCurrentBranch();
  // Detached HEAD: mid-rebase/bisect or a tag checkout — leave everything as is.
  if (!gitBranch) return;

  const state = readState();
  const ifPreview = process.argv.includes("--if-preview");
  // Only worth a network call when we're currently on a preview.
  if (ifPreview && (!state.activeNeonBranch || state.gitBranch !== gitBranch))
    return;
  // Same branch as last time (e.g. re-checkout, or two branches at one commit
  // already handled): nothing to look up.
  if (
    state.gitBranch === gitBranch &&
    !ifPreview &&
    !process.argv.includes("--force")
  )
    return;

  // Stay silent on post-merge refreshes unless something changes.
  if (!ifPreview) {
    console.log("\n🔄 Checking for Neon preview branch...\n");
    console.log(`Current git branch: ${gitBranch}`);
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.log(
      "⚠️  NEON_PROJECT_ID not found. Set it as an environment variable or add projectId to .neon file.",
    );
    console.log("   Leaving database URLs unchanged.\n");
    return;
  }

  const neonBranch = findNeonBranch(projectId, gitBranch);
  if (neonBranch === undefined) {
    // Don't record gitBranch so the next checkout retries.
    console.log("⚠️  Leaving database URLs unchanged.\n");
    return;
  }

  if (neonBranch === null) {
    console.log(`No Neon preview branch for git branch '${gitBranch}'.`);
    if (state.activeNeonBranch) {
      restoreBase(state);
      writeLog(
        `git="${gitBranch}": no preview branch, left neon="${state.activeNeonBranch}"`,
      );
      console.log(
        `\n✅ Switched back from Neon branch: ${state.activeNeonBranch}\n`,
      );
    } else {
      console.log("   Database URLs already point at the default database.\n");
    }
    writeState({ gitBranch });
    return;
  }

  // Post-merge refresh and the preview is still there: nothing to do.
  if (ifPreview && state.activeNeonBranch === neonBranch) return;

  console.log(`Found matching Neon branch: ${neonBranch}`);
  console.log("Fetching connection strings...");
  const values: Record<string, string> = {};
  for (const [key, kind] of Object.entries(ENV_VARS)) {
    const url = getConnectionString(projectId, neonBranch, kind === "pooled");
    if (!url) {
      console.log("⚠️  Leaving database URLs unchanged.\n");
      return;
    }
    values[key] = url;
  }

  const before = readEnvFile();
  const next: State = { gitBranch, activeNeonBranch: neonBranch };
  if (state.activeNeonBranch) {
    // Preview → preview: keep the original base, not the previous preview.
    next.base = state.base;
    next.createdEnvFile = state.createdEnvFile;
  } else {
    next.base = Object.fromEntries(
      Object.keys(ENV_VARS).map((key) => [key, getEnvValue(before ?? "", key)]),
    );
    next.createdEnvFile = before === null;
  }
  // Save the base before touching the env file so it can always be restored.
  writeState(next);

  let content = before ?? "";
  for (const [key, url] of Object.entries(values))
    content = setEnvValue(content, key, `"${url}"`);
  writeEnvFile(content);
  console.log(`Updated ${ENV_FILE} with new database URLs`);

  const endpointName = extractEndpointName(Object.values(values)[0]);
  writeLog(
    `Switched branches: git="${gitBranch}" -> neon="${neonBranch}" (endpoint: ${endpointName})`,
  );

  console.log(`\n✅ Successfully switched to Neon branch: ${neonBranch}`);
  console.log(`   Endpoint: ${endpointName}\n`);
}

main().catch((error) => {
  console.error("Error updating Neon branch:", error.message);
  process.exit(0); // Don't fail the checkout
});
