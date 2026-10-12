import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireLock } from "./lock";

let dir: string;
let lockPath: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "weekly-lock-"));
  lockPath = path.join(dir, ".weekly.lock");
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

/** A PID that belonged to a process which has now exited. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ["-e", ""]);
  return child.pid!;
}

describe("acquireLock", () => {
  it("takes the lock once and refuses a second taker while it is held", () => {
    const release = acquireLock(lockPath);
    expect(release).not.toBeNull();
    expect(fs.readFileSync(lockPath, "utf8")).toBe(String(process.pid));

    expect(acquireLock(lockPath)).toBeNull();

    release!();
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it("can be taken again after release", () => {
    acquireLock(lockPath)!();
    const again = acquireLock(lockPath);
    expect(again).not.toBeNull();
    again!();
  });

  it("takes over a stale lock left by a dead process", () => {
    fs.writeFileSync(lockPath, String(deadPid()));

    const release = acquireLock(lockPath);
    expect(release).not.toBeNull();
    expect(fs.readFileSync(lockPath, "utf8")).toBe(String(process.pid));
    release!();
  });

  it("treats an unreadable PID in the lock as stale", () => {
    fs.writeFileSync(lockPath, "not-a-pid");

    const release = acquireLock(lockPath);
    expect(release).not.toBeNull();
    release!();
  });

  it("does not remove a lock that another run now holds", () => {
    const release = acquireLock(lockPath)!;
    // Another process takes over the lock after ours was removed (e.g. a stale-lock takeover).
    fs.writeFileSync(lockPath, String(process.pid + 1));

    release();
    expect(fs.existsSync(lockPath)).toBe(true);
  });
});
