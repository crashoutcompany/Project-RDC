import fs from "fs";
import { createHash } from "crypto";

/**
 * Append-only JSONL key/value store for paid classifier results, so re-running
 * the harvester with the same model and settings costs nothing — matching
 * the download/frames resumability. Later lines win, so a re-classified key
 * simply appends.
 */
export class DetectionCache<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly filePath: string) {
    if (!fs.existsSync(filePath)) return;
    for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const { key, value } = JSON.parse(line) as { key: string; value: T };
        this.entries.set(key, value);
      } catch {
        // A torn last line from an interrupted run; skip it.
      }
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): T | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: T): void {
    this.entries.set(key, value);
    fs.appendFileSync(this.filePath, JSON.stringify({ key, value }) + "\n");
  }
}

/**
 * Content hash of a frame image. Keys the cache by pixels rather than
 * frameId, so re-extracting frames with a different --start/--fps can't
 * return another frame's verdict.
 */
export function hashFile(filePath: string): string {
  return createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
}
