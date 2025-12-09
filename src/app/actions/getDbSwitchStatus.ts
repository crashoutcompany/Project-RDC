"use server";

import fs from "fs";
import path from "path";

const LOG_FILE = ".neon-switch.log";

/**
 * Represents a database switch log entry
 */
export type DbSwitchEntry = {
  timestamp: string;
  gitBranch: string;
  neonBranch: string;
  endpoint: string;
};

/**
 * Parses a log entry line into a structured object
 * @param line - The log line to parse
 * @returns The parsed DbSwitchEntry or null if parsing fails
 */
function parseLogEntry(line: string): DbSwitchEntry | null {
  // Format: [timestamp] Switched branches: git="branch" -> neon="branch" (endpoint: name)
  const match = line.match(
    /\[(.+?)\] Switched branches: git="(.+?)" -> neon="(.+?)" \(endpoint: (.+?)\)/,
  );

  if (!match) return null;

  return {
    timestamp: match[1],
    gitBranch: match[2],
    neonBranch: match[3],
    endpoint: match[4],
  };
}

/**
 * Gets the latest database switch entry from the log file.
 * This is used to detect when the database URL has changed after a git branch switch.
 * Only returns data in development mode.
 *
 * @returns The latest DbSwitchEntry or null if no entry exists or not in development
 */
export async function getLatestDbSwitchEntry(): Promise<DbSwitchEntry | null> {
  // Only run in development mode
  if (process.env.NODE_ENV !== "development") return null;

  const logPath = path.join(process.cwd(), LOG_FILE);

  if (!fs.existsSync(logPath)) return null;

  try {
    const content = fs.readFileSync(logPath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim() !== "");

    if (lines.length === 0) return null;

    // Get the last (most recent) entry
    const lastLine = lines[lines.length - 1];
    return parseLogEntry(lastLine);
  } catch {
    console.error("Failed to read database switch log");
    return null;
  }
}
