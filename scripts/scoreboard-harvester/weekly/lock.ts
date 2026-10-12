import fs from "fs";

/**
 * A lock file that is empty or unparseable and was modified within this window
 * is treated as held. Current code writes the PID atomically, so this only
 * covers locks written by older versions that created the file first and wrote
 * the PID afterwards, where another starter can briefly see an empty file.
 */
const FRESH_UNREADABLE_LOCK_MS = 5_000;

/**
 * Takes the run lock at `lockPath`. Returns a release function, or null when
 * another live process holds it.
 *
 * The lock file is created with `wx` (O_EXCL) and the PID is written in the
 * same call, so two starters can't both see "no lock" and both proceed, and
 * no starter can observe an empty lock file from this version. A lock whose
 * PID is no longer running (a crashed run) is taken over. The lock is also
 * released on process exit, so a signal that skips `finally` doesn't leave it
 * behind.
 */
export function acquireLock(lockPath: string): (() => void) | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (holderIsAlive(lockPath)) return null;
      // Stale lock from a crashed run: remove it and try once more.
      fs.rmSync(lockPath, { force: true });
      continue;
    }
    // Only remove the file if it still holds our PID, so a stale release can't delete a newer run's lock.
    const release = () => {
      try {
        if (fs.readFileSync(lockPath, "utf8") === String(process.pid))
          fs.rmSync(lockPath, { force: true });
      } catch {
        // Already gone.
      }
    };
    process.once("exit", release);
    return () => {
      process.removeListener("exit", release);
      release();
    };
  }
  // Lost the race for a stale lock to another starter.
  return null;
}

function holderIsAlive(lockPath: string): boolean {
  let raw: string;
  let mtimeMs: number;
  try {
    raw = fs.readFileSync(lockPath, "utf8");
    mtimeMs = fs.statSync(lockPath).mtimeMs;
  } catch {
    return false;
  }
  const pid = Number(raw);
  if (!Number.isInteger(pid) || pid <= 0) {
    // Possibly a lock still being written by an older version: treat a very recent one as held.
    return Date.now() - mtimeMs < FRESH_UNREADABLE_LOCK_MS;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
