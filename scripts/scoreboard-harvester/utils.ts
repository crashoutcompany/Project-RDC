import { spawn, SpawnOptions } from "child_process";
import { createHash } from "crypto";

/**
 * Runs a command with inherited stdio and resolves on clean exit. Used for
 * long-running tools like yt-dlp and ffmpeg where we want progress visible.
 *
 * @param cmd - The executable to run.
 * @param args - Arguments to pass to the executable.
 * @param opts - Optional spawn options.
 * @returns A promise that resolves on exit code 0, rejects otherwise.
 */
export function runSpawn(
  cmd: string,
  args: string[],
  opts: SpawnOptions = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: "inherit", ...opts });
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

/**
 * Runs a command and captures stdout. Used for tools whose output we need to
 * parse (ffprobe, vision-ocr).
 *
 * @param cmd - The executable to run.
 * @param args - Arguments to pass to the executable.
 * @returns A promise resolving to stdout as a UTF-8 string.
 */
export function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${cmd} exit ${code}`));
    });
    proc.on("error", reject);
  });
}

/**
 * Formats seconds as HH-MM-SS for use in filenames (no colons, filesystem-safe).
 */
export function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return `${pad(h)}-${pad(m)}-${pad(s)}`;
}

/**
 * Zero-pads a non-negative single-digit number to two characters via
 * String.prototype.padStart. Used to render the H/M/S components of fmtTime.
 *
 * @param n - Number to pad (caller is expected to pass a non-negative integer).
 * @returns A two-character string (or longer if `n` is already two-plus digits).
 */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Extracts a YouTube video ID from a URL. Supports watch, youtu.be, shorts, embed.
 *
 * @param url - The URL to parse.
 * @returns The 11-character video ID, or null if no match.
 */
export function extractYoutubeId(url: string): string | null {
  const m = url.match(
    /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

/**
 * Strips shell-escape backslashes from a URL. zsh's "escape glob chars on
 * paste" feature transforms `?` → `\?` and `=` → `\=`, and those escapes can
 * survive into the program's argv when double-quoted. This is harmless for
 * normal URLs but breaks YouTube fetches since yt-dlp uses the URL literally.
 *
 * @param url - Possibly-escaped URL string.
 * @returns URL with backslash-escapes stripped from common URL metacharacters.
 */
export function sanitizeUrl(url: string): string {
  // Only strip backslashes that precede known URL metacharacters. Keeps any
  // backslashes that are intentionally part of the URL path (extremely rare).
  return url.replace(/\\([?&=#])/g, "$1");
}

/**
 * Stable slug derived from a video URL, used as the per-video output dir.
 * Falls back to a SHA-1 prefix for non-YouTube URLs so two different Twitch
 * / Vimeo / arbitrary URLs don't collide on the literal string "video".
 *
 * @param url - Source URL (already sanitized).
 * @returns 11-character slug suitable for use as a directory name.
 */
export function urlToSlug(url: string): string {
  const ytId = extractYoutubeId(url);
  if (ytId) return ytId;
  return createHash("sha1").update(url).digest("hex").slice(0, 11);
}

/**
 * Parses a CLI string into a finite number, enforcing optional bounds.
 * Exits the process with a clear error if the input is not a number or is
 * out of range — much better UX than letting NaN silently propagate into
 * ffmpeg filter strings or comparison operators downstream.
 *
 * @param args.name - Flag name (without `--`), used in error messages.
 * @param args.raw - Raw string value from parseArgs (or undefined).
 * @param args.kind - "int" uses parseInt(.,10); "float" uses parseFloat.
 * @param args.min - Optional inclusive lower bound.
 * @param args.max - Optional inclusive upper bound.
 * @returns The parsed number, or undefined if `raw` was undefined/empty.
 */
export function parseFiniteNumber(args: {
  name: string;
  raw: string | undefined;
  kind: "int" | "float";
  min?: number;
  max?: number;
}): number | undefined {
  const { name, raw, kind, min, max } = args;
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === "") return undefined;
  // parseInt/parseFloat both happily eat trailing junk ("12abc" → 12), which
  // can let typos slip silently into ffmpeg args or comparison operators.
  // Require the whole string to match a numeric shape before parsing.
  const pattern =
    kind === "int" ? /^-?\d+$/ : /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
  if (!pattern.test(trimmed)) {
    console.error(`Invalid --${name}: must be a number, got "${raw}"`);
    process.exit(1);
  }
  const v = kind === "int" ? parseInt(trimmed, 10) : parseFloat(trimmed);
  if (!Number.isFinite(v)) {
    console.error(`Invalid --${name}: must be a number, got "${raw}"`);
    process.exit(1);
  }
  if (min !== undefined && v < min) {
    console.error(`Invalid --${name}: must be >= ${min}, got ${v}`);
    process.exit(1);
  }
  if (max !== undefined && v > max) {
    console.error(`Invalid --${name}: must be <= ${max}, got ${v}`);
    process.exit(1);
  }
  return v;
}
