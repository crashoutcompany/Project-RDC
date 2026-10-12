import fs from "fs";

/**
 * Takes the run lock at `lockPath`. Returns a release function, or null when
 * another live process holds it.
 *
 * The lock file is created with `wx` (O_EXCL), so the create is atomic: two
 * starters can't both see "no lock" and both proceed. A lock whose PID is no
 * longer running (a crashed run) is taken over. The lock is also released on
 * process exit, so a signal that skips `finally` doesn't leave it behind.
 */
export function acquireLock(lockPath: string): (() => void) | null {
  for (let attempt = 0; attempt < 2; attempt++) {
    let fd: number;
    try {
      fd = fs.openSync(lockPath, "wx");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (holderIsAlive(lockPath)) return null;
      // Stale lock from a crashed run: remove it and try once more.
      fs.rmSync(lockPath, { force: true });
      continue;
    }
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
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
  let pid: number;
  try {
    pid = Number(fs.readFileSync(lockPath, "utf8"));
  } catch {
    return false;
  }
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}
