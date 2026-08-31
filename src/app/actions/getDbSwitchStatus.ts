"use server";

import fs from "fs";
import path from "path";

const LOG_FILE = ".neon-switch.log";

export type DbSwitchEntry = {
  timestamp: string;
  gitBranch: string;
  neonBranch: string;
  endpoint: string;
};

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

/** Latest Neon branch-switch log entry; dev-only (null in production). */
export async function getLatestDbSwitchEntry(): Promise<DbSwitchEntry | null> {
  // Only run in development mode
  if (process.env.NODE_ENV !== "development") return null;

  const logPath = path.join(process.cwd(), LOG_FILE);

  try {
    const content = await fs.promises.readFile(logPath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim() !== "");

    if (lines.length === 0) return null;

    // Get the last (most recent) entry
    const lastLine = lines[lines.length - 1];
    return parseLogEntry(lastLine);
  } catch (error) {
    console.error("Failed to read database switch log", error);
    return null;
  }
}
