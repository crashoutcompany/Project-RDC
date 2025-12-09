#!/usr/bin/env tsx
/**
 * Script to automatically update DATABASE_URL and DIRECT_URL in .env.development.local
 * when switching git branches. Uses neonctl to fetch connection strings for Neon preview branches.
 *
 * This script is triggered by the git post-checkout hook via Husky.
 *
 * @requires NEON_PROJECT_ID environment variable (or projectId in .neon file)
 * @requires neonctl authentication (run 'neonctl auth' to authenticate)
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const ENV_FILE = ".env.development.local";
const NEON_CONFIG_FILE = ".neon";
const LOG_FILE = ".neon-switch.log";
const MAX_LOG_ENTRIES = 50;

/**
 * Executes a shell command and returns the output
 * @param command - The command to execute
 * @returns The command output or null if it failed
 */
function execCommand(command: string): string | null {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Gets the current git branch name
 * @returns The current branch name
 */
function getCurrentBranch(): string {
  const branch = execCommand("git rev-parse --abbrev-ref HEAD");
  if (!branch) throw new Error("Failed to get current git branch");
  return branch;
}

/**
 * Reads the Neon project ID from environment or .neon config file
 * @returns The Neon project ID or null if not found
 */
function getProjectId(): string | null {
  // First check environment variable
  if (process.env.NEON_PROJECT_ID) return process.env.NEON_PROJECT_ID;

  // Then check .neon config file
  const neonConfigPath = path.join(process.cwd(), NEON_CONFIG_FILE);
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
 * Lists all Neon branches and finds one matching the current git branch pattern
 * @param projectId - The Neon project ID
 * @param gitBranch - The current git branch name
 * @returns The matching Neon branch name or null
 */
function findNeonBranch(projectId: string, gitBranch: string): string | null {
  // List all branches in JSON format
  const output = execCommand(
    `npx neonctl branches list --project-id ${projectId} --output json`,
  );

  if (!output) {
    console.log("Failed to list Neon branches");
    return null;
  }

  try {
    const branches = JSON.parse(output);

    // Pattern: preview/pr-{number}-{branch_name}
    const pattern = new RegExp(`^preview/pr-\\d+-${escapeRegExp(gitBranch)}$`);

    for (const branch of branches) {
      if (pattern.test(branch.name)) {
        console.log(`Found matching Neon branch: ${branch.name}`);
        return branch.name;
      }
    }
  } catch {
    console.log("Failed to parse Neon branches response");
  }

  return null;
}

/**
 * Escapes special regex characters in a string
 * @param str - The string to escape
 * @returns The escaped string
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extracts the Neon endpoint name from a connection string
 * Pattern: @ep-{name}-{name2}-{id}... -> returns "{name}-{name2}"
 * @param connectionString - The full connection string
 * @returns The extracted endpoint name or "unknown"
 */
function extractEndpointName(connectionString: string): string {
  // Match @ep-{word}-{word}- pattern
  const match = connectionString.match(/@ep-([a-z]+)-([a-z]+)-/i);
  if (match) return `${match[1]}-${match[2]}`;
  return "unknown";
}

/**
 * Writes a log entry to the log file, keeping only the last MAX_LOG_ENTRIES
 * @param gitBranch - The git branch name
 * @param neonBranch - The Neon branch name
 * @param endpointName - The extracted endpoint name from the connection string
 */
function writeLog(
  gitBranch: string,
  neonBranch: string,
  endpointName: string,
): void {
  const logPath = path.join(process.cwd(), LOG_FILE);
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] Switched branches: git="${gitBranch}" -> neon="${neonBranch}" (endpoint: ${endpointName})`;

  // Read existing log entries
  let entries: string[] = [];
  if (fs.existsSync(logPath)) {
    const content = fs.readFileSync(logPath, "utf8");
    entries = content.split("\n").filter((line) => line.trim() !== "");
  }

  // Add new entry and keep only the last MAX_LOG_ENTRIES
  entries.push(logEntry);
  if (entries.length > MAX_LOG_ENTRIES)
    entries = entries.slice(-MAX_LOG_ENTRIES);

  // Write back to file
  fs.writeFileSync(logPath, entries.join("\n") + "\n");
}

/**
 * Gets the connection string for a Neon branch
 * @param projectId - The Neon project ID
 * @param branchName - The Neon branch name
 * @param pooled - Whether to get the pooled connection string
 * @returns The connection string or null
 */
function getConnectionString(
  projectId: string,
  branchName: string,
  pooled: boolean,
): string | null {
  const pooledFlag = pooled ? "--pooled" : "";
  const command =
    `npx neonctl connection-string --project-id ${projectId} --branch "${branchName}" ${pooledFlag}`.trim();

  const connectionString = execCommand(command);
  if (!connectionString) {
    console.log(
      `Failed to get ${pooled ? "pooled" : "direct"} connection string`,
    );
    return null;
  }

  return connectionString;
}

/**
 * Updates the .env.development.local file with new database URLs
 * @param databaseUrl - The pooled connection string for DATABASE_URL
 * @param directUrl - The direct connection string for DIRECT_URL
 */
function updateEnvFile(databaseUrl: string, directUrl: string): void {
  const envPath = path.join(process.cwd(), ENV_FILE);

  let content = "";
  if (fs.existsSync(envPath)) content = fs.readFileSync(envPath, "utf8");

  // Update or add DATABASE_URL
  if (content.match(/^DATABASE_URL=/m)) {
    content = content.replace(
      /^DATABASE_URL=.*/m,
      `DATABASE_URL="${databaseUrl}"`,
    );
  } else {
    content += `\nDATABASE_URL="${databaseUrl}"`;
  }

  // Update or add DIRECT_URL
  if (content.match(/^DIRECT_URL=/m)) {
    content = content.replace(/^DIRECT_URL=.*/m, `DIRECT_URL="${directUrl}"`);
  } else {
    content += `\nDIRECT_URL="${directUrl}"`;
  }

  // Clean up any double newlines at the start
  content = content.replace(/^\n+/, "");

  fs.writeFileSync(envPath, content);
  console.log(`Updated ${ENV_FILE} with new database URLs`);
}

/**
 * Main function to update Neon branch connection strings
 */
async function main(): Promise<void> {
  console.log("\n🔄 Checking for Neon preview branch...\n");

  // Get current git branch
  const gitBranch = getCurrentBranch();
  console.log(`Current git branch: ${gitBranch}`);

  // Get project ID
  const projectId = getProjectId();
  if (!projectId) {
    console.log(
      "⚠️  NEON_PROJECT_ID not found. Set it as an environment variable or add projectId to .neon file.",
    );
    console.log("   Keeping existing DATABASE_URL and DIRECT_URL.\n");
    return;
  }

  // Find matching Neon branch
  const neonBranch = findNeonBranch(projectId, gitBranch);
  if (!neonBranch) {
    console.log(`No Neon preview branch found for git branch '${gitBranch}'.`);
    console.log(
      "   This is normal if you're not on a PR branch or the branch hasn't been created yet.",
    );
    console.log("   Keeping existing DATABASE_URL and DIRECT_URL.\n");
    return;
  }

  // Get connection strings
  console.log("Fetching connection strings...");
  const databaseUrl = getConnectionString(projectId, neonBranch, true);
  const directUrl = getConnectionString(projectId, neonBranch, false);

  if (!databaseUrl || !directUrl) {
    console.log(
      "⚠️  Failed to get connection strings. Keeping existing DATABASE_URL and DIRECT_URL.\n",
    );
    return;
  }

  // Update .env.development.local
  updateEnvFile(databaseUrl, directUrl);

  // Log the branch switch
  const endpointName = extractEndpointName(databaseUrl);
  writeLog(gitBranch, neonBranch, endpointName);

  console.log(`\n✅ Successfully switched to Neon branch: ${neonBranch}`);
  console.log(`   Endpoint: ${endpointName}\n`);
}

main().catch((error) => {
  console.error("Error updating Neon branch:", error.message);
  process.exit(0); // Don't fail the checkout
});
